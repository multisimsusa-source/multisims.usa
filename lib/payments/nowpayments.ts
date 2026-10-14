import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import type { PaymentStatus } from "@/lib/types"
import type { Invoice, InvoiceRequest, PaymentEvent, PaymentProvider } from "./provider"

/**
 * NOWPayments hosted invoices (https://documenter.getpostman.com/view/7907941/S1a32n38).
 *
 * - Checkout: POST /invoice with a fixed rate, so the crypto amount holds while the buyer
 *   pays. The buyer picks the coin on NOWPayments' page; the account allows only BTC and
 *   USDT TRC-20, and pays out straight to the client's own wallets (custody off).
 * - Webhooks (IPN): header x-nowpayments-sig is the hex HMAC-SHA512, keyed with the IPN
 *   secret, of the body re-serialised with its keys sorted. The body is then only a
 *   trigger: GET /payment/{id} is the answer we record.
 * - Statuses: waiting, confirming, confirmed, sending, partially_paid, finished, failed,
 *   refunded, expired. Only finished is paid. There is no overpaid status: it is a
 *   finished payment where actually_paid is above pay_amount.
 */

const PRODUCTION = "https://api.nowpayments.io/v1"
const SANDBOX = "https://api-sandbox.nowpayments.io/v1"

const statusMap: Record<string, PaymentStatus> = {
  waiting: "awaiting",
  confirming: "confirming",
  confirmed: "confirming",
  sending: "confirming",
  partially_paid: "partially_paid",
  finished: "paid",
  failed: "failed",
  refunded: "failed",
  expired: "expired",
}

type NowPayment = {
  payment_id: number | string
  invoice_id?: number | string | null
  payment_status: string
  order_id?: string | null
  pay_currency?: string | null
  pay_amount?: number | string | null
  actually_paid?: number | string | null
}

export class NowPaymentsProvider implements PaymentProvider {
  readonly id = "nowpayments"
  private readonly base: string

  constructor(
    private readonly apiKey: string,
    private readonly ipnSecret: string,
    sandbox = false
  ) {
    this.base = sandbox ? SANDBOX : PRODUCTION
  }

  async createInvoice(request: InvoiceRequest): Promise<Invoice> {
    const data = await this.call<{ id?: string | number; invoice_url?: string }>("/invoice", {
      method: "POST",
      body: JSON.stringify({
        price_amount: request.amountCents / 100,
        price_currency: "usd",
        order_id: request.paymentId,
        order_description: request.description.slice(0, 200),
        ipn_callback_url: request.webhookUrl,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        partially_paid_url: request.successUrl,
        is_fixed_rate: true,
        is_fee_paid_by_user: false,
      }),
    })
    if (!data.id || !data.invoice_url?.startsWith("https://")) throw new Error("NOWPayments returned no invoice")
    return { providerInvoiceId: String(data.id), url: data.invoice_url }
  }

  /**
   * The live minimum for the coins we take, each paid out in the same coin, at a fixed
   * rate (as our invoices are). The buyer picks the coin after checkout, so the higher
   * of the two applies.
   */
  async minimumCents(): Promise<number | null> {
    const pairs = ["usdttrc20", "btc"]
    const results = await Promise.all(
      pairs.map((coin) =>
        this.call<{ fiat_equivalent?: number }>(
          `/min-amount?currency_from=${coin}&currency_to=${coin}&fiat_equivalent=usd&is_fixed_rate=true&is_fee_paid_by_user=false`
        )
      )
    )
    const usd = results.map((r) => Number(r.fiat_equivalent))
    if (usd.some((v) => !Number.isFinite(v) || v <= 0)) return null
    return Math.ceil(Math.max(...usd) * 100)
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const given = headers.get("x-nowpayments-sig")?.trim().toLowerCase()
    if (!given || !/^[0-9a-f]{128}$/.test(given)) return false
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return false
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return false

    // Their docs sort keys recursively; their older Node sample passes the top-level
    // keys as a JSON.stringify allow-list. Both are accepted, each compared in constant time.
    const candidates = [
      JSON.stringify(sortDeep(body)),
      JSON.stringify(body, Object.keys(body).sort()),
    ]
    const expected = Buffer.from(given, "hex")
    return candidates.some((message) => {
      const actual = createHmac("sha512", this.ipnSecret).update(message).digest()
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    })
  }

  async confirmWebhook(rawBody: string): Promise<PaymentEvent> {
    const hint = JSON.parse(rawBody) as Partial<NowPayment>
    if (!hint.payment_id || !/^\d{1,20}$/.test(String(hint.payment_id))) throw new Error("Webhook has no payment_id")
    const p = await this.call<NowPayment>(`/payment/${hint.payment_id}`)

    const payAmount = toNumber(p.pay_amount)
    const actuallyPaid = toNumber(p.actually_paid)
    const status = statusMap[p.payment_status] ?? "awaiting"
    return {
      paymentId: p.order_id ?? hint.order_id ?? null,
      providerInvoiceId: p.invoice_id != null ? String(p.invoice_id) : hint.invoice_id != null ? String(hint.invoice_id) : null,
      providerPaymentId: String(p.payment_id),
      providerStatus: p.payment_status,
      status,
      payCurrency: p.pay_currency ?? null,
      payAmount,
      actuallyPaid,
      overpaid: status === "paid" && payAmount !== null && actuallyPaid !== null && actuallyPaid > payAmount,
      body: { webhook: hint, payment: p },
    }
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`NOWPayments ${init.method ?? "GET"} ${path} failed: ${res.status} ${text.slice(0, 300)}`)
    return JSON.parse(text) as T
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])])
    )
  }
  return value
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
