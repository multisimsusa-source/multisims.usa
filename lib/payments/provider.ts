import type { PaymentStatus } from "@/lib/types"

/**
 * The seam between checkout and whoever takes the money. Crypto (NOWPayments) is the
 * first implementation; a card or bank processor in the next phase is a second one,
 * chosen per payment, with no change to checkout or fulfilment.
 */
export interface PaymentProvider {
  /** Stored on payments.provider. */
  readonly id: string
  createInvoice(request: InvoiceRequest): Promise<Invoice>
  /** True only when the webhook really came from the provider. */
  verifyWebhook(rawBody: string, headers: Headers): boolean
  /**
   * Turns a verified webhook into a payment event. The webhook is only a trigger: the
   * provider is asked again for the payment, and that answer is what gets recorded.
   */
  confirmWebhook(rawBody: string): Promise<PaymentEvent>
  /** The smallest payment the provider accepts right now, in US cents, or null if unknown. */
  minimumCents(): Promise<number | null>
}

export type InvoiceRequest = {
  /** Our payments.id. Sent as the provider's order reference and echoed back in webhooks. */
  paymentId: string
  amountCents: number
  description: string
  successUrl: string
  cancelUrl: string
  webhookUrl: string
}

export type Invoice = { providerInvoiceId: string; url: string }

export type PaymentEvent = {
  /** Our payments.id, when the provider echoed it back. */
  paymentId: string | null
  providerInvoiceId: string | null
  providerPaymentId: string | null
  providerStatus: string
  status: PaymentStatus
  payCurrency: string | null
  payAmount: number | null
  actuallyPaid: number | null
  overpaid: boolean
  body: unknown
}

/** How far along a payment is. A webhook never moves a payment backwards. */
export const paymentRank: Record<PaymentStatus, number> = {
  awaiting: 0,
  expired: 1,
  failed: 1,
  confirming: 2,
  partially_paid: 3,
  paid: 4,
  not_required: 4,
}

/** Statuses a payment may move from on its way to `status` (same rank or lower). */
export function statusesBelow(status: PaymentStatus): PaymentStatus[] {
  return (Object.keys(paymentRank) as PaymentStatus[]).filter((s) => paymentRank[s] <= paymentRank[status] && s !== "not_required")
}
