import "server-only"

import { randomUUID } from "node:crypto"
import { z } from "zod"

import type { FormState } from "@/lib/form-state"
import { createServiceClient } from "@/lib/supabase/service"
import type { Ticket } from "@/lib/types"
import { checkImage } from "@/lib/uploads"

/**
 * Filing a support ticket, shared by the customer's order page and the dealer portal.
 * Callers check who may file for the order first (order token, or dealer ownership);
 * this validates the form, checks something was delivered, stores the screenshot and
 * inserts the ticket with the service role.
 */


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

export function ticketValues(formData: FormData) {
  return {
    type: String(formData.get("type") ?? ""),
    item: String(formData.get("item") ?? ""),
    severity: String(formData.get("severity") ?? ""),
    description: String(formData.get("description") ?? ""),
  }
}

export async function fileTicket(orderId: string, formData: FormData): Promise<{ state: FormState; ticket?: Ticket }> {
  const values = ticketValues(formData)
  const fieldErrors: Record<string, string> = {}
  const parsed = ticketSchema.safeParse(values)
  if (!parsed.success) for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message

  const file = formData.get("screenshot")
  const screenshot = file instanceof File && file.size > 0 ? file : null
  let screenshotExt: string | null = null
  if (screenshot) {
    const checked = await checkImage(screenshot)
    if ("error" in checked) fieldErrors.screenshot = checked.error
    else screenshotExt = checked.ext
  }
  if (!parsed.success || Object.keys(fieldErrors).length) {
    return { state: { status: "error", message: "Please check the highlighted fields.", fieldErrors, values } }
  }

  const db = createServiceClient()
  const [{ data: type }, { data: items }, { data: replacements }] = await Promise.all([
    db.from("ticket_types").select("id, name").eq("id", parsed.data.type).eq("active", true).maybeSingle(),
    db.from("order_items").select("id, status").eq("order_id", orderId),
    db.from("orders").select("id").eq("replacement_of", orderId),
  ])
  const { data: replacementItems } = replacements?.length
    ? await db.from("order_items").select("id, status").in("order_id", replacements.map((r) => r.id))
    : { data: [] as { id: string; status: string }[] }
  const known = [...(items ?? []), ...(replacementItems ?? [])]

  if (!type) return { state: { status: "error", fieldErrors: { type: "Choose what the problem is" }, values } }
  if (!known.some((i) => i.status === "fulfilled" || i.status === "replaced")) {
    return { state: { status: "error", message: "You can raise a request once your order is delivered.", values } }
  }
  const itemId = parsed.data.item && known.some((i) => i.id === parsed.data.item) ? parsed.data.item : null

  let screenshotPath: string | null = null
  if (screenshot && screenshotExt) {
    screenshotPath = `${orderId}/${randomUUID()}.${screenshotExt}`
    const { error } = await db.storage.from("ticket-screenshots").upload(screenshotPath, screenshot, { contentType: screenshot.type, upsert: false })
    if (error) {
      console.error("[ticket] screenshot upload failed", error)
      return { state: { status: "error", message: "We could not upload the screenshot. Try a smaller image.", values } }
    }
  }

  const { data: ticket, error } = await db
    .from("tickets")
    .insert({
      order_id: orderId,
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
    return { state: { status: "error", message: "We could not send your request. Please try again.", values } }
  }
  return { state: { status: "success", message: `Request #${ticket.number} sent.` }, ticket: ticket as Ticket }
}
