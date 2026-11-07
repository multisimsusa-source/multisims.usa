"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { isOrderToken } from "@/lib/customer-order"
import { checkDevice, tidyDevice, type DeviceField } from "@/lib/device"
import { addOrderPhoto } from "@/lib/order-photos"
import {
  notifyActivationRequested,
  notifyCustomerMessage,
  notifyNewTicket,
} from "@/lib/notify"
import { getPaymentProvider, invoiceUrlForOrder } from "@/lib/payments"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { createServiceClient } from "@/lib/supabase/service"
import { fileTicket, ticketValues } from "@/lib/tickets"
import { verifyTurnstile } from "@/lib/turnstile"
import type { Order } from "@/lib/types"
import type { FormState } from "@/lib/form-state"
import { itemRateable, orderRateable, reviewSchema } from "@/lib/review-rules"
import { writeReview } from "@/lib/review-store"

export type { FormState }

async function loadOrder(token: string) {
  if (!isOrderToken(token)) return null
  const { data } = await createServiceClient()
    .from("orders")
    .select("*")
    .eq("public_token", token)
    .maybeSingle()
  return (data as Order | null) ?? null
}

/**
 * The Pay button on an unpaid order: back to the open invoice, or a fresh one once the
 * old one has expired. The price is the one saved on the order, never recalculated.
 */
export async function startPayment(token: string): Promise<void> {
  const order = await loadOrder(token)
  if (!order) redirect("/")
  const page = `/order/${order.public_token}`
  const provider = getPaymentProvider()
  if (
    order.status !== "awaiting_payment" ||
    !provider ||
    ["confirming", "partially_paid", "paid"].includes(order.payment_status)
  )
    redirect(page)
  if (!(await rateLimit(`pay:${await clientIp()}`, 10, 10 * 60_000)).ok)
    redirect(`${page}?pay=busy`)

  let url: string | null = null
  try {
    url = await invoiceUrlForOrder(provider, order)
  } catch (err) {
    console.error("[order] could not open an invoice", err)
  }
  redirect(url ?? `${page}?pay=error`)
}

/**
 * "My SIM has arrived, activate it". Works once per order: the database only moves an
 * order that is still waiting for this. The order can be the original or one of its
 * replacements, so it is checked against the token's order.
 */
export async function requestActivation(
  token: string,
  orderId: string
): Promise<void> {
  const order = await loadOrder(token)
  if (!order) redirect("/")
  const page = `/order/${order.public_token}`
  if (!z.uuid().safeParse(orderId).success) redirect(page)
  if (!(await rateLimit(`activate:${token.slice(0, 16)}`, 5, 10 * 60_000)).ok)
    redirect(page)

  const db = createServiceClient()
  if (orderId !== order.id) {
    const { data: rep } = await db
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("replacement_of", order.id)
      .maybeSingle()
    if (!rep) redirect(page)
  }
  const { data, error } = await db.rpc("request_activation", {
    p_order_id: orderId,
  })
  if (!error && data) after(() => notifyActivationRequested(data as Order))
  redirect(`${page}?activation=${error ? "done" : "requested"}`)
}

const messageSchema = z
  .string()
  .trim()
  .min(10, "Tell us a little more, at least 10 characters")
  .max(2000, "Keep it under 2,000 characters")

/** The contact button on an order still processing after the alert window. */
export async function sendOrderMessage(
  token: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const message = String(formData.get("message") ?? "")
  const values = { message }
  const ip = await clientIp()
  if (
    !(await rateLimit(`order-msg:${ip}`, 6, 60 * 60_000)).ok ||
    !(await rateLimit(`order-msg:${token.slice(0, 16)}`, 3, 60 * 60_000)).ok
  ) {
    return {
      status: "error",
      message: "You have sent a few messages already. We will reply by email.",
      values,
    }
  }
  if (
    !(await verifyTurnstile(
      formData.get("cf-turnstile-response") as string | null,
      ip
    ))
  ) {
    return {
      status: "error",
      message: "Please complete the verification and try again.",
      values,
    }
  }

  const parsed = messageSchema.safeParse(message)
  if (!parsed.success)
    return {
      status: "error",
      fieldErrors: { message: parsed.error.issues[0].message },
      values,
    }

  const order = await loadOrder(token)
  if (!order)
    return { status: "error", message: "We could not find this order.", values }

  const db = createServiceClient()
  const { data: settings } = await db
    .from("settings")
    .select("unclaimed_alert_minutes")
    .maybeSingle()
  const waitMs = (settings?.unclaimed_alert_minutes ?? 5) * 60_000
  const open = !["fulfilled", "cancelled"].includes(order.status)
  if (
    !open ||
    !order.paid_at ||
    Date.now() - new Date(order.paid_at).getTime() < waitMs
  ) {
    return {
      status: "error",
      message: "Your order is moving. Please check back in a few minutes.",
      values,
    }
  }

  const { error } = await db
    .from("order_messages")
    .insert({ order_id: order.id, message: parsed.data })
  if (error)
    return {
      status: "error",
      message: "We could not send your message. Please try again.",
      values,
    }

  after(() => notifyCustomerMessage(order, parsed.data))
  return { status: "success" }
}

/** Support ticket from the order page. Only after something was delivered. */
export async function createTicket(
  token: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const values = ticketValues(formData)
  if (formData.get("company")) return { status: "success" }

  const ip = await clientIp()
  if (!(await rateLimit(`ticket:${ip}`, 5, 60 * 60_000)).ok) {
    return {
      status: "error",
      message: "Too many requests. Please try again later.",
      values,
    }
  }
  if (
    !(await verifyTurnstile(
      formData.get("cf-turnstile-response") as string | null,
      ip
    ))
  ) {
    return {
      status: "error",
      message: "Please complete the verification and try again.",
      values,
    }
  }

  const order = await loadOrder(token)
  if (!order)
    return { status: "error", message: "We could not find this order.", values }

  const { state, ticket } = await fileTicket(order.id, formData)
  if (!ticket) return state
  after(() => notifyNewTicket(order, ticket))
  refresh()
  return state
}

/**
 * The customer rates their order, or one SIM on it, and may change it later. Stored for
 * the owner, who decides which to feature on the website; nothing is public until then.
 * itemId null rates the whole order. A SIM may belong to a replacement of this order.
 */
export async function saveReview(
  token: string,
  itemId: string | null,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const values = {
    rating: String(formData.get("rating") ?? ""),
    comment: String(formData.get("comment") ?? ""),
  }
  if (!(await rateLimit(`review:${await clientIp()}`, 30, 60 * 60_000)).ok) {
    return {
      status: "error",
      message: "Too many requests. Please try again later.",
      values,
    }
  }
  const parsed = reviewSchema.safeParse(values)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0])] ??= issue.message
    return { status: "error", fieldErrors, values }
  }

  const order = await loadOrder(token)
  if (!order || order.channel !== "website" || order.replacement_of)
    return { status: "error", message: "We could not find this order.", values }

  let target: { orderId: string } | null = null
  if (itemId === null) {
    if (orderRateable(order)) target = { orderId: order.id }
  } else if (z.uuid().safeParse(itemId).success) {
    const db = createServiceClient()
    const { data: item } = await db
      .from("order_items")
      .select("id, status, order_id")
      .eq("id", itemId)
      .maybeSingle()
    const { data: owner } = item
      ? await db
          .from("orders")
          .select("id, status, product_type, phase, activation_requested_at, replacement_of")
          .eq("id", item.order_id)
          .maybeSingle()
      : { data: null }
    const belongs =
      owner && (owner.id === order.id || owner.replacement_of === order.id)
    if (item && owner && belongs && itemRateable(owner, item))
      target = { orderId: owner.id }
  }
  if (!target)
    return {
      status: "error",
      message:
        order.product_type === "physical"
          ? "You can rate it once your SIM card has arrived."
          : "You can rate it once it is delivered.",
      values,
    }

  // First name only, as the customer gave it, for the website if the owner features it.
  const firstName =
    order.customer_name.trim().split(/\s+/)[0].slice(0, 40) || "Customer"
  const result = await writeReview({
    orderId: target.orderId,
    itemId,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    displayName: firstName,
  })
  if (result === "failed")
    return {
      status: "error",
      message: "We could not save your rating. Please try again.",
      values,
    }
  refresh()
  return {
    status: "success",
    message: result === "created" ? "Thanks for your rating" : "Rating updated",
  }
}

/** Database messages a buyer may read, as sentences. */
function sentence(message: string) {
  return message.charAt(0).toUpperCase() + message.slice(1) + (message.endsWith(".") ? "" : ".")
}

/**
 * A buyer adds or fixes their phone details on a SIM not delivered yet. The order link is
 * the proof; the item must belong to it.
 */
export async function saveDeviceDetails(token: string, itemId: string, formData: FormData): Promise<ActionResult> {
  const order = await loadOrder(token)
  if (!order) return { ok: false, error: "This order link is not valid." }
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Unknown SIM." }
  if (!(await rateLimit(`device:${token.slice(0, 16)}`, 30, 10 * 60_000)).ok) {
    return { ok: false, error: "Too many changes. Wait a few minutes and try again." }
  }
  const db = createServiceClient()
  const { data: item } = await db.from("order_items").select("id, buyer_iccid").eq("id", itemId).eq("order_id", order.id).maybeSingle()
  if (!item) return { ok: false, error: "Unknown SIM." }

  const fieldErrors: Record<string, string> = {}
  const value = (f: DeviceField) => tidyDevice(String(formData.get(f) ?? ""))
  for (const f of ["imei", "eid"] as const) {
    const problem = checkDevice(f, value(f))
    if (problem) fieldErrors[f] = problem
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted fields.", fieldErrors }

  const { error } = await db.rpc("set_item_device", {
    p_item_id: itemId,
    p_imei: value("imei"),
    p_eid: value("eid"),
    p_buyer_iccid: item.buyer_iccid ?? "",
  })
  if (error) return { ok: false, error: error.code === "P0001" ? sentence(error.message) : "That did not save. Try again." }
  refresh()
  return { ok: true, message: "Saved" }
}

/** A photo of the phone's IMEI or EID screen, for the agent, while the order is still open. */
export async function addCustomerPhoto(token: string, formData: FormData): Promise<ActionResult> {
  const order = await loadOrder(token)
  if (!order) return { ok: false, error: "This order link is not valid." }
  if (order.status === "fulfilled" || order.status === "cancelled") return { ok: false, error: "This order is already done." }
  if (!(await rateLimit(`photo:${await clientIp()}`, 20, 60 * 60_000)).ok) {
    return { ok: false, error: "Too many photos. Wait a little and try again." }
  }
  const file = formData.get("photo")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo." }
  const added = await addOrderPhoto(order.id, file, null)
  if (!added.ok) return { ok: false, error: added.error }
  refresh()
  return { ok: true, message: "Photo added" }
}
