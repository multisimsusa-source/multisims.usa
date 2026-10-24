"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { isOrderToken } from "@/lib/customer-order"
import { notifyActivationRequested, notifyCustomerMessage, notifyNewTicket } from "@/lib/notify"
import { getPaymentProvider, invoiceUrlForOrder } from "@/lib/payments"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { createServiceClient } from "@/lib/supabase/service"
import { fileTicket, ticketValues } from "@/lib/tickets"
import { verifyTurnstile } from "@/lib/turnstile"
import type { Order } from "@/lib/types"
import type { FormState } from "@/lib/form-state"

export type { FormState }

async function loadOrder(token: string) {
  if (!isOrderToken(token)) return null
  const { data } = await createServiceClient().from("orders").select("*").eq("public_token", token).maybeSingle()
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
  if (order.status !== "awaiting_payment" || !provider || ["confirming", "partially_paid", "paid"].includes(order.payment_status)) redirect(page)
  if (!(await rateLimit(`pay:${await clientIp()}`, 10, 10 * 60_000)).ok) redirect(`${page}?pay=busy`)

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
export async function requestActivation(token: string, orderId: string): Promise<void> {
  const order = await loadOrder(token)
  if (!order) redirect("/")
  const page = `/order/${order.public_token}`
  if (!z.uuid().safeParse(orderId).success) redirect(page)
  if (!(await rateLimit(`activate:${token.slice(0, 16)}`, 5, 10 * 60_000)).ok) redirect(page)

  const db = createServiceClient()
  if (orderId !== order.id) {
    const { data: rep } = await db.from("orders").select("id").eq("id", orderId).eq("replacement_of", order.id).maybeSingle()
    if (!rep) redirect(page)
  }
  const { data, error } = await db.rpc("request_activation", { p_order_id: orderId })
  if (!error && data) after(() => notifyActivationRequested(data as Order))
  redirect(`${page}?activation=${error ? "done" : "requested"}`)
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

/** Support ticket from the order page. Only after something was delivered. */
export async function createTicket(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = ticketValues(formData)
  if (formData.get("company")) return { status: "success" }

  const ip = await clientIp()
  if (!(await rateLimit(`ticket:${ip}`, 5, 60 * 60_000)).ok) {
    return { status: "error", message: "Too many requests. Please try again later.", values }
  }
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response") as string | null, ip))) {
    return { status: "error", message: "Please complete the verification and try again.", values }
  }

  const order = await loadOrder(token)
  if (!order) return { status: "error", message: "We could not find this order.", values }

  const { state, ticket } = await fileTicket(order.id, formData)
  if (!ticket) return state
  after(() => notifyNewTicket(order, ticket))
  refresh()
  return state
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars"),
  comment: z.string().trim().max(500, "Keep it under 500 characters"),
})

/**
 * The customer rates a delivered website order, once. Stored for the owner, who decides
 * which to feature on the website; nothing is shown publicly until then.
 */
export async function submitReview(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = { rating: String(formData.get("rating") ?? ""), comment: String(formData.get("comment") ?? "") }
  if (!(await rateLimit(`review:${await clientIp()}`, 10, 60 * 60_000)).ok) {
    return { status: "error", message: "Too many requests. Please try again later.", values }
  }
  const parsed = reviewSchema.safeParse(values)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { status: "error", fieldErrors, values }
  }

  const order = await loadOrder(token)
  if (!order || order.channel !== "website") return { status: "error", message: "We could not find this order.", values }
  if (order.status !== "fulfilled") return { status: "error", message: "You can rate your order once it is delivered.", values }

  // First name only, as the customer gave it, for the website if the owner features it.
  const firstName = order.customer_name.trim().split(/\s+/)[0].slice(0, 40) || "Customer"
  const { error } = await createServiceClient().from("reviews").insert({
    order_id: order.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    display_name: firstName,
  })
  if (error?.code === "23505") return { status: "success", message: "You already rated this order. Thank you." }
  if (error) {
    console.error("[review] insert failed", error)
    return { status: "error", message: "We could not save your rating. Please try again.", values }
  }
  refresh()
  return { status: "success" }
}
