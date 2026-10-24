import "server-only"

import { after } from "next/server"

import { notifyDealerFunds, notifyOrderPaid, notifyPaymentIssue, notifyTopupIssue } from "@/lib/notify"
import { orderLabel } from "@/lib/orders"
import { roundUpToDollar } from "@/lib/pricing"
import { absoluteUrl } from "@/lib/site"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order, Payment, PaymentStatus } from "@/lib/types"
import { NowPaymentsProvider } from "./nowpayments"
import { paymentRank, statusesBelow, type PaymentEvent, type PaymentProvider } from "./provider"

/**
 * The configured provider, or null when none is set up. With none, checkout takes no
 * payment and orders go straight to the queue (development and demos only: production
 * must not open checkout to the public without a provider).
 */
export function getPaymentProvider(): PaymentProvider | null {
  const key = process.env.NOWPAYMENTS_API_KEY
  const secret = process.env.NOWPAYMENTS_IPN_SECRET
  if (!key || !secret) return null
  return new NowPaymentsProvider(key, secret, process.env.NOWPAYMENTS_SANDBOX === "true")
}

/** The live provider minimum is cached briefly: it moves with network fees, not by the second. */
const MINIMUM_TTL_MS = 5 * 60_000
let minimumCache: { at: number; cents: number | null } | null = null

async function providerMinimumCents(provider: PaymentProvider): Promise<number | null> {
  if (minimumCache && Date.now() - minimumCache.at < MINIMUM_TTL_MS) return minimumCache.cents
  let cents: number | null = null
  try {
    cents = await provider.minimumCents()
  } catch (err) {
    console.error("[payments] could not read the provider minimum, using the setting", err)
  }
  minimumCache = { at: Date.now(), cents }
  return cents
}

/**
 * The smallest order checkout accepts: the Settings minimum, or the provider's live
 * minimum when that is higher, rounded up to whole dollars. Without a provider (local
 * development) only the setting applies.
 */
export async function minimumOrderCents(settingCents: number): Promise<number> {
  const provider = getPaymentProvider()
  const live = provider ? await providerMinimumCents(provider) : null
  return roundUpToDollar(Math.max(settingCents, live ?? 0))
}

export function paymentsEnabled() {
  return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET)
}

/**
 * A fixed-rate invoice holds its crypto price for about 20 minutes once the buyer picks
 * a coin, so an unpaid invoice is reused for 15 minutes and then replaced by a fresh one.
 */
const REUSE_INVOICE_MS = 15 * 60_000

/** The hosted payment page for an unpaid order: the open invoice, or a new one. */
export async function invoiceUrlForOrder(provider: PaymentProvider, order: Order): Promise<string> {
  const db = createServiceClient()
  const { data: latest } = await db
    .from("payments")
    .select("*")
    .eq("order_id", order.id)
    .eq("provider", provider.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const open = latest as Payment | null
  if (open?.invoice_url && open.status === "awaiting" && Date.now() - new Date(open.created_at).getTime() < REUSE_INVOICE_MS) {
    return open.invoice_url
  }

  const { data: row, error } = await db
    .from("payments")
    .insert({ order_id: order.id, provider: provider.id, price_cents: order.total_cents })
    .select("id")
    .single()
  if (error || !row) throw new Error(`Could not record the payment: ${error?.message}`)

  try {
    const orderPage = absoluteUrl(`/order/${order.public_token}`)
    const invoice = await provider.createInvoice({
      paymentId: row.id,
      amountCents: order.total_cents,
      description: `${orderLabel(order)} ${order.carrier_name} ${order.plan_name} x ${order.quantity}`,
      successUrl: `${orderPage}?paid=1`,
      cancelUrl: orderPage,
      webhookUrl: absoluteUrl(`/api/payments/${provider.id}`),
    })
    await db.from("payments").update({ provider_invoice_id: invoice.providerInvoiceId, invoice_url: invoice.url }).eq("id", row.id)
    return invoice.url
  } catch (err) {
    await db.from("payments").delete().eq("id", row.id)
    throw err
  }
}

/** Smallest and largest top-up a dealer can start. The provider minimum applies on top. */
export const TOPUP_MIN_CENTS = 2000
export const TOPUP_MAX_CENTS = 5_000_000

/**
 * A hosted payment page for a dealer wallet top-up. The balance rises only when the
 * provider's webhook confirms the payment (applyPaymentEvent).
 */
export async function invoiceUrlForTopUp(provider: PaymentProvider, dealerId: string, amountCents: number): Promise<string> {
  const db = createServiceClient()
  const { data: row, error } = await db
    .from("payments")
    .insert({ kind: "wallet_topup", dealer_id: dealerId, provider: provider.id, price_cents: amountCents })
    .select("id")
    .single()
  if (error || !row) throw new Error(`Could not record the top-up: ${error?.message}`)

  try {
    const wallet = absoluteUrl("/dealer/wallet")
    const invoice = await provider.createInvoice({
      paymentId: row.id,
      amountCents,
      description: "MultiSims USA dealer balance top-up",
      successUrl: `${wallet}?topup=sent`,
      cancelUrl: wallet,
      webhookUrl: absoluteUrl(`/api/payments/${provider.id}`),
    })
    await db.from("payments").update({ provider_invoice_id: invoice.providerInvoiceId, invoice_url: invoice.url }).eq("id", row.id)
    return invoice.url
  } catch (err) {
    await db.from("payments").delete().eq("id", row.id)
    throw err
  }
}

/** A top-up moved on: credit the wallet once when paid; tell the owner when it is short or long. */
async function applyTopUpEvent(payment: Payment, event: PaymentEvent) {
  const db = createServiceClient()
  if (event.status === "paid") {
    const { data, error } = await db.rpc("credit_wallet_topup", { p_payment_id: payment.id })
    if (error) throw new Error(`Could not credit top-up ${payment.id}: ${error.message}`)
    const credited = data as { id: number } | null
    if (credited?.id && payment.dealer_id) {
      const dealerId = payment.dealer_id
      after(() => notifyDealerFunds(dealerId, payment.price_cents, "topup", null, `topup-${payment.id}`))
    }
    if (event.overpaid) after(() => notifyTopupIssue(payment, "overpaid", event))
    return
  }
  if (event.status === "partially_paid") after(() => notifyTopupIssue(payment, "underpaid", event))
}

/**
 * Records a confirmed payment event and moves the order on. Safe to run twice and in
 * any order: a payment never moves backwards, and the paid email is sent once.
 */
export async function applyPaymentEvent(provider: PaymentProvider, event: PaymentEvent) {
  const db = createServiceClient()
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  let payment: Payment | null = null
  if (event.paymentId && uuid.test(event.paymentId)) {
    const { data } = await db.from("payments").select("*").eq("id", event.paymentId).eq("provider", provider.id).maybeSingle()
    payment = data as Payment | null
  }
  if (!payment && event.providerInvoiceId) {
    const { data } = await db.from("payments").select("*").eq("provider", provider.id).eq("provider_invoice_id", event.providerInvoiceId).maybeSingle()
    payment = data as Payment | null
  }

  await db.from("payment_events").insert({
    payment_id: payment?.id ?? null,
    provider: provider.id,
    provider_status: event.providerStatus,
    body: event.body,
  })
  if (!payment) {
    console.error(`[payments] ${provider.id} event for an unknown payment`, event.paymentId, event.providerInvoiceId)
    return
  }

  // Never backwards: the update only applies while the stored status ranks at or below.
  const { data: updated, error } = await db
    .from("payments")
    .update({
      status: event.status,
      provider_status: event.providerStatus,
      provider_payment_id: event.providerPaymentId,
      pay_currency: event.payCurrency,
      pay_amount: event.payAmount,
      actually_paid: event.actuallyPaid,
      overpaid: event.overpaid,
    })
    .eq("id", payment.id)
    .in("status", statusesBelow(event.status))
    .select("id")
  if (error) throw new Error(`Could not update payment ${payment.id}: ${error.message}`)
  if (!updated?.length) return
  if (payment.kind === "wallet_topup") return applyTopUpEvent(payment, event)
  if (!payment.order_id) return

  const orderId = payment.order_id
  if (event.status === "paid") {
    const { error: paidError } = await db.rpc("mark_order_paid", { p_order_id: orderId, p_payment_status: "paid" })
    if (paidError) {
      // Paid after the owner cancelled it: keep the money on record and tell the owner.
      console.error(`[payments] paid order ${orderId} could not be queued`, paidError.message)
      after(() => notifyPaymentIssue(orderId, "paid_after_cancel", event))
      return
    }
    after(() => notifyOrderPaid(orderId))
    if (event.overpaid) after(() => notifyPaymentIssue(orderId, "overpaid", event))
    return
  }

  // Not paid yet: the order shows the furthest any of its invoices has got.
  const { data: all } = await db.from("payments").select("status").eq("order_id", orderId)
  const best = ((all ?? []) as { status: PaymentStatus }[])
    .map((p) => p.status)
    .reduce<PaymentStatus>((a, b) => (paymentRank[b] > paymentRank[a] ? b : a), "awaiting")
  await db.from("orders").update({ payment_status: best }).eq("id", orderId).eq("status", "awaiting_payment")

  if (event.status === "partially_paid") after(() => notifyPaymentIssue(orderId, "underpaid", event))
}
