"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { notifyNewOrderToStaff } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/form-state"
import { itemRateable, orderRateable, reviewSchema } from "@/lib/review-rules"
import { writeReview } from "@/lib/review-store"
import type { Order } from "@/lib/types"
import { checkDevice, tidyDevice, type DeviceField } from "@/lib/device"
import { addOrderPhoto } from "@/lib/order-photos"

/** The dealer has the SIM cards in hand: every posted line in the batch goes to be activated. */
export async function requestBatchActivation(
  batchId: string
): Promise<ActionResult> {
  await requireRole("dealer")
  if (!z.uuid().safeParse(batchId).success)
    return { ok: false, error: "Unknown order" }
  const supabase = await createClient()
  const { data: count, error } = await supabase.rpc(
    "request_batch_activation",
    { p_batch_id: batchId }
  )
  if (error)
    return { ok: false, error: "Could not start the lines. Try again." }
  if (!count)
    return { ok: false, error: "These SIM cards are already being activated." }

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "queued")
    .eq("phase", "activate")
  await Promise.all(
    ((orders ?? []) as Order[]).map((o) =>
      notifyNewOrderToStaff(o, { activation: true })
    )
  )
  refresh()
  return { ok: true, message: "Your lines are starting up" }
}

/**
 * The dealer rates a line of their order (itemId null) or one SIM on it, and may change
 * it later. The session client only finds the dealer's own orders (RLS), so a found order
 * is theirs; the review is written with the service role. Dealer reviews stay in admin.
 */
export async function saveDealerReview(
  orderId: string,
  itemId: string | null,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const profile = await requireRole("dealer")
  const values = {
    rating: String(formData.get("rating") ?? ""),
    comment: String(formData.get("comment") ?? ""),
  }
  const parsed = reviewSchema.safeParse(values)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0])] ??= issue.message
    return { status: "error", fieldErrors, values }
  }
  if (!z.uuid().safeParse(orderId).success || (itemId !== null && !z.uuid().safeParse(itemId).success))
    return { status: "error", message: "Unknown order", values }

  const supabase = await createClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, product_type, phase, activation_requested_at, dealer_id")
    .eq("id", orderId)
    .maybeSingle()
  if (!order || order.dealer_id !== profile.id)
    return { status: "error", message: "Unknown order", values }

  let rateable = false
  if (itemId === null) rateable = orderRateable(order)
  else {
    const { data: item } = await supabase
      .from("order_items")
      .select("id, status")
      .eq("id", itemId)
      .eq("order_id", order.id)
      .maybeSingle()
    rateable = Boolean(item) && itemRateable(order, item!)
  }
  if (!rateable)
    return {
      status: "error",
      message:
        order.product_type === "physical"
          ? "You can rate it once the SIM cards have arrived."
          : "You can rate it once it is delivered.",
      values,
    }

  const { data: dealer } = await supabase
    .from("dealers")
    .select("company")
    .eq("profile_id", profile.id)
    .maybeSingle()
  const result = await writeReview({
    orderId: order.id,
    itemId,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    displayName: (dealer?.company || profile.full_name || "Dealer").trim().slice(0, 40),
  })
  if (result === "failed")
    return { status: "error", message: "Could not save your rating. Try again.", values }
  refresh()
  return {
    status: "success",
    message: result === "created" ? "Thanks for your rating" : "Rating updated",
  }
}

/** The dealer adds or fixes a SIM's device details while it is not delivered (set_item_device checks). */
export async function saveDealerDevice(itemId: string, formData: FormData): Promise<ActionResult> {
  await requireRole("dealer")
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Unknown SIM" }
  const fieldErrors: Record<string, string> = {}
  const value = (f: DeviceField) => tidyDevice(String(formData.get(f) ?? ""))
  for (const f of ["imei", "eid", "buyer_iccid"] as const) {
    const problem = checkDevice(f, value(f))
    if (problem) fieldErrors[f] = problem
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted fields", fieldErrors }
  const supabase = await createClient()
  const { error } = await supabase.rpc("set_item_device", {
    p_item_id: itemId,
    p_imei: value("imei"),
    p_eid: value("eid"),
    p_buyer_iccid: value("buyer_iccid"),
  })
  if (error) {
    const msg = error.code === "P0001" ? error.message : "That did not save. Try again"
    return { ok: false, error: msg.charAt(0).toUpperCase() + msg.slice(1) }
  }
  refresh()
  return { ok: true, message: "Saved" }
}

/** A photo of a device's IMEI, EID or SIM card for one of the dealer's open lines. */
export async function addDealerPhoto(orderId: string, formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("dealer")
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Unknown order" }
  // The session client only finds the dealer's own orders (RLS).
  const supabase = await createClient()
  const { data: order } = await supabase.from("orders").select("id, status").eq("id", orderId).maybeSingle()
  if (!order) return { ok: false, error: "Unknown order" }
  if (order.status === "fulfilled" || order.status === "cancelled") return { ok: false, error: "This line is already done" }
  const file = formData.get("photo")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo" }
  const added = await addOrderPhoto(order.id, file, profile.id)
  if (!added.ok) return { ok: false, error: added.error }
  refresh()
  return { ok: true, message: "Photo added" }
}
