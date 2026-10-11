"use server"

import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { isOrderToken } from "@/lib/customer-order"
import { notifyCustomerMessage, notifyNewTicket } from "@/lib/notify"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { createServiceClient } from "@/lib/supabase/service"
import { verifyTurnstile } from "@/lib/turnstile"
import type { Order, Ticket } from "@/lib/types"

export type FormState = {
  status: "idle" | "success" | "error"
  message?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

async function loadOrder(token: string) {
  if (!isOrderToken(token)) return null
  const { data } = await createServiceClient().from("orders").select("*").eq("public_token", token).maybeSingle()
  return (data as Order | null) ?? null
}

const messageSchema = z
  .string()
  .trim()
  .min(10, "Tell us a little more, at least 10 characters")
  .max(2000, "Keep it under 2,000 characters")

/** The contact button on an order still processing after the alert window. */
export async function sendOrderMessage(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const message = String(formData.get("message") ?? "")
  const values = { message }
  const ip = await clientIp()
  if (!(await rateLimit(`order-msg:${ip}`, 6, 60 * 60_000)).ok || !(await rateLimit(`order-msg:${token.slice(0, 16)}`, 3, 60 * 60_000)).ok) {
    return { status: "error", message: "You have sent a few messages already. We will reply by email.", values }
  }
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response") as string | null, ip))) {
    return { status: "error", message: "Please complete the verification and try again.", values }
  }

  const parsed = messageSchema.safeParse(message)
  if (!parsed.success) return { status: "error", fieldErrors: { message: parsed.error.issues[0].message }, values }

  const order = await loadOrder(token)
  if (!order) return { status: "error", message: "We could not find this order.", values }

  const db = createServiceClient()
  const { data: settings } = await db.from("settings").select("unclaimed_alert_minutes").maybeSingle()
  const waitMs = (settings?.unclaimed_alert_minutes ?? 5) * 60_000
  const open = !["fulfilled", "cancelled"].includes(order.status)
  if (!open || !order.paid_at || Date.now() - new Date(order.paid_at).getTime() < waitMs) {
    return { status: "error", message: "Your order is moving. Please check back in a few minutes.", values }
  }

  const { error } = await db.from("order_messages").insert({ order_id: order.id, message: parsed.data })
  if (error) return { status: "error", message: "We could not send your message. Please try again.", values }

  after(() => notifyCustomerMessage(order, parsed.data))
  return { status: "success" }
}

const SCREENSHOT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
}
const SCREENSHOT_MAX = 5 * 1024 * 1024

const ticketSchema = z.object({
  type: z.uuid("Choose what the problem is"),
  item: z.union([z.literal(""), z.uuid()]),
  severity: z.enum(["low", "medium", "high", "urgent"], "Choose how urgent it is"),
  description: z
    .string()
    .trim()
    .min(50, "Describe the problem in at least 50 characters")
    .max(4000, "Keep it under 4,000 characters"),
})

/** Support ticket from the order page. Only after something was delivered. */
export async function createTicket(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    type: String(formData.get("type") ?? ""),
    item: String(formData.get("item") ?? ""),
    severity: String(formData.get("severity") ?? ""),
    description: String(formData.get("description") ?? ""),
  }
  if (formData.get("company")) return { status: "success" }

  const ip = await clientIp()
  if (!(await rateLimit(`ticket:${ip}`, 5, 60 * 60_000)).ok) {
    return { status: "error", message: "Too many requests. Please try again later.", values }
  }
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response") as string | null, ip))) {
    return { status: "error", message: "Please complete the verification and try again.", values }
  }

  const fieldErrors: Record<string, string> = {}
  const parsed = ticketSchema.safeParse(values)
  if (!parsed.success) for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message

  const file = formData.get("screenshot")
  const screenshot = file instanceof File && file.size > 0 ? file : null
  let screenshotExt: string | null = null
  if (screenshot) {
    screenshotExt = SCREENSHOT_TYPES[screenshot.type] ?? null
    if (!screenshotExt) fieldErrors.screenshot = "Use a PNG, JPG, GIF or WebP image"
    else if (screenshot.size > SCREENSHOT_MAX) fieldErrors.screenshot = "The image is over 5 MB"
    else if (!(await looksLikeImage(screenshot))) fieldErrors.screenshot = "That file is not a readable image"
  }
  if (!parsed.success || Object.keys(fieldErrors).length) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors, values }
  }

  const order = await loadOrder(token)
  if (!order) return { status: "error", message: "We could not find this order.", values }

  const db = createServiceClient()
  const [{ data: type }, { data: items }, { data: replacements }] = await Promise.all([
    db.from("ticket_types").select("id, name").eq("id", parsed.data.type).eq("active", true).maybeSingle(),
    db.from("order_items").select("id, status").eq("order_id", order.id),
    db.from("orders").select("id").eq("replacement_of", order.id),
  ])
  const { data: replacementItems } = replacements?.length
    ? await db.from("order_items").select("id, status").in("order_id", replacements.map((r) => r.id))
    : { data: [] as { id: string; status: string }[] }
  const known = [...(items ?? []), ...(replacementItems ?? [])]

  if (!type) return { status: "error", fieldErrors: { type: "Choose what the problem is" }, values }
  if (!known.some((i) => i.status === "fulfilled" || i.status === "replaced")) {
    return { status: "error", message: "You can raise a request once your order is delivered.", values }
  }
  const itemId = parsed.data.item && known.some((i) => i.id === parsed.data.item) ? parsed.data.item : null

  let screenshotPath: string | null = null
  if (screenshot && screenshotExt) {
    screenshotPath = `${order.id}/${randomUUID()}.${screenshotExt}`
    const { error } = await db.storage
      .from("ticket-screenshots")
      .upload(screenshotPath, screenshot, { contentType: screenshot.type, upsert: false })
    if (error) {
      console.error("[ticket] screenshot upload failed", error)
      return { status: "error", message: "We could not upload the screenshot. Try a smaller image.", values }
    }
  }

  const { data: ticket, error } = await db
    .from("tickets")
    .insert({
      order_id: order.id,
      order_item_id: itemId,
      ticket_type_id: type.id,
      type_name: type.name,
      severity: parsed.data.severity,
      description: parsed.data.description,
      screenshot_path: screenshotPath,
    })
    .select("*")
    .single()
  if (error || !ticket) {
    console.error("[ticket] insert failed", error)
    return { status: "error", message: "We could not send your request. Please try again.", values }
  }

  after(() => notifyNewTicket(order, ticket as Ticket))
  refresh()
  return { status: "success", message: `Request #${ticket.number} sent.` }
}

/** Checks the file's first bytes, not just the type the browser claims. */
async function looksLikeImage(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45
  return png || jpg || gif || webp
}
