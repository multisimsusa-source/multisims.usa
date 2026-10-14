"use server"

import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireStaff } from "@/lib/auth"
import { notifyNewOrderToStaff, notifyOrderDelivered, notifyTicketAnswered } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"
import type { Order, Ticket, TicketStatus } from "@/lib/types"

/**
 * Every state change goes through a Postgres function that checks the caller's role
 * and the order's current state atomically; these actions only validate input, map
 * errors to plain words, and send the emails that follow.
 */

const id = z.uuid()

function fail(error: { message?: string } | null, fallback = "That did not work. Refresh and try again."): ActionResult {
  const msg = error?.message ?? ""
  if (/already claimed/.test(msg)) return { ok: false, error: "Another agent claimed this order first." }
  if (/claim the order first/.test(msg)) return { ok: false, error: "Claim the order first. It may have been released or reassigned." }
  if (/missing details on (\d+)/.test(msg)) {
    const n = msg.match(/missing details on (\d+)/)?.[1]
    return { ok: false, error: `${n} SIM${n === "1" ? " is" : "s are"} still missing a QR code or tracking number.` }
  }
  if (/not allowed/.test(msg)) return { ok: false, error: "Your account cannot do that." }
  if (msg && !/violates|syntax|relation/.test(msg)) return { ok: false, error: msg.charAt(0).toUpperCase() + msg.slice(1) + "." }
  return { ok: false, error: fallback }
}

export async function claimOrder(orderId: string): Promise<ActionResult> {
  await requireStaff()
  if (!id.safeParse(orderId).success) return { ok: false, error: "Unknown order" }
  const supabase = await createClient()
  const { error } = await supabase.rpc("claim_order", { p_order_id: orderId })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: "Claimed. It is yours." }
}

export async function releaseOrder(orderId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.rpc("release_order", { p_order_id: orderId })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: "Released back to the queue" }
}

export async function flagOrder(orderId: string, reason: string): Promise<ActionResult> {
  await requireStaff()
  const text = reason.trim()
  if (text.length < 5) return { ok: false, error: "Say what the problem is, for example: no lines for this plan right now." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("flag_order", { p_order_id: orderId, p_reason: text.slice(0, 500) })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: "Flagged for the owner" }
}

const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const QR_MAX = 2 * 1024 * 1024

const itemSchema = z.object({
  phone_number: z.string().trim().max(30, "Too long"),
  iccid: z
    .string()
    .trim()
    .max(30, "Too long")
    .refine((v) => v === "" || /^[0-9A-Fa-f]{18,22}$/.test(v.replace(/\s/g, "")), "An ICCID is 18 to 22 digits"),
  tracking_number: z.string().trim().max(60, "Too long"),
})

/** Saves one SIM's details, uploading its QR image when one is attached. */
export async function saveItem(itemId: string, formData: FormData): Promise<ActionResult> {
  await requireStaff()
  if (!id.safeParse(itemId).success) return { ok: false, error: "Unknown SIM" }

  const parsed = itemSchema.safeParse({
    phone_number: formData.get("phone_number") ?? "",
    iccid: formData.get("iccid") ?? "",
    tracking_number: formData.get("tracking_number") ?? "",
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { ok: false, error: "Check the highlighted fields", fieldErrors }
  }

  const supabase = await createClient()
  const { data: item } = await supabase.from("order_items").select("id, order_id").eq("id", itemId).maybeSingle()
  if (!item) return { ok: false, error: "Unknown SIM" }

  let qrPath = ""
  const file = formData.get("qr")
  if (file instanceof File && file.size > 0) {
    const ext = QR_TYPES[file.type]
    if (!ext) return { ok: false, error: "Use a PNG, JPG or WebP image", fieldErrors: { qr: "Use a PNG, JPG or WebP image" } }
    if (file.size > QR_MAX) return { ok: false, error: "The image is over 2 MB", fieldErrors: { qr: "The image is over 2 MB" } }
    qrPath = `${item.order_id}/${item.id}-${randomUUID().slice(0, 8)}.${ext}`
    const { error: uploadError } = await supabase.storage.from("esim-qr").upload(qrPath, file, { contentType: file.type })
    if (uploadError) {
      console.error("[agent] QR upload failed", uploadError)
      return { ok: false, error: "The QR image did not upload. Try again." }
    }
  }

  const { error } = await supabase.rpc("save_order_item", {
    p_item_id: itemId,
    p_phone_number: parsed.data.phone_number,
    p_iccid: parsed.data.iccid.replace(/\s/g, ""),
    p_qr_path: qrPath,
    p_tracking_number: parsed.data.tracking_number,
  })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: qrPath ? "QR code saved" : "Saved" }
}

/** Physical orders: one tracking number for every SIM in the parcel. */
export async function saveTracking(orderId: string, tracking: string): Promise<ActionResult> {
  await requireStaff()
  const value = tracking.trim()
  if (value.length < 8 || value.length > 60) return { ok: false, error: "Enter the full tracking number" }
  const supabase = await createClient()
  const { data: items } = await supabase
    .from("order_items")
    .select("id, phone_number, iccid")
    .eq("order_id", orderId)
    .eq("status", "pending")
  for (const item of items ?? []) {
    const { error } = await supabase.rpc("save_order_item", {
      p_item_id: item.id,
      p_phone_number: item.phone_number ?? "",
      p_iccid: item.iccid ?? "",
      p_qr_path: "",
      p_tracking_number: value,
    })
    if (error) return fail(error)
  }
  refresh()
  return { ok: true, message: "Tracking number saved" }
}

/** Mark complete: the customer gets their QR codes or tracking by email and on their page. */
export async function completeOrder(orderId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("complete_order", { p_order_id: orderId })
  if (error) return fail(error)
  const order = data as Order
  after(() => notifyOrderDelivered(order.id))
  refresh()
  const message = order.product_type === "esim" ? "Delivered to the customer" : order.status === "fulfilled" ? "Line active. The customer has the number." : "Marked shipped"
  return { ok: true, message }
}

const answerSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"]),
  answer: z.string().trim().max(4000, "Keep it under 4,000 characters"),
})

/** One answer per ticket. The customer is emailed when the answer text changes. */
export async function answerTicket(ticketId: string, formData: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = answerSchema.safeParse({ status: formData.get("status"), answer: formData.get("answer") ?? "" })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: before } = await supabase.from("tickets").select("answer").eq("id", ticketId).maybeSingle()
  const { data, error } = await supabase.rpc("answer_ticket", {
    p_ticket_id: ticketId,
    p_status: parsed.data.status as TicketStatus,
    p_answer: parsed.data.answer,
  })
  if (error) return fail(error)
  const ticket = data as Ticket
  const changed = Boolean(ticket.answer) && ticket.answer !== (before?.answer ?? null)
  if (changed) after(() => notifyTicketAnswered(ticket))
  refresh()
  return { ok: true, message: changed ? "Saved and emailed to the customer" : "Saved" }
}

/** Free replacement for one delivered SIM, straight into the queue (or held for approval). */
export async function issueReplacement(itemId: string, ticketId: string | null): Promise<ActionResult> {
  await requireStaff()
  if (!id.safeParse(itemId).success) return { ok: false, error: "Unknown SIM" }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("issue_replacement", { p_item_id: itemId, p_ticket_id: ticketId })
  if (error) return fail(error)
  const order = data as Order
  if (order.status === "queued") after(() => notifyNewOrderToStaff(order))
  refresh()
  return {
    ok: true,
    id: order.id,
    message: order.status === "queued" ? `Replacement MS-${order.number} is in the queue` : `Replacement MS-${order.number} is waiting for the owner's approval`,
  }
}
