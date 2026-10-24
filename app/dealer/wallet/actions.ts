"use server"

import { requireRole } from "@/lib/auth"
import { parseMoney } from "@/lib/admin/result"
import { formatPrice } from "@/lib/format"
import { getPaymentProvider, invoiceUrlForTopUp, minimumOrderCents, TOPUP_MAX_CENTS, TOPUP_MIN_CENTS } from "@/lib/payments"

export type TopUpResult = { ok: true; url: string } | { ok: false; error: string }

/** Opens a crypto invoice for a top-up and returns the payment page to send the dealer to. */
export async function startTopUp(amount: string): Promise<TopUpResult> {
  const profile = await requireRole("dealer")
  const provider = getPaymentProvider()
  if (!provider) return { ok: false, error: "Crypto top-up is not available yet. Ask us to add funds instead." }

  const cents = parseMoney(amount)
  const minimum = await minimumOrderCents(TOPUP_MIN_CENTS)
  if (cents === null || Number.isNaN(cents)) return { ok: false, error: "Enter an amount in dollars, for example 500" }
  if (cents < minimum) return { ok: false, error: `The smallest top-up is ${formatPrice(minimum)}` }
  if (cents > TOPUP_MAX_CENTS) return { ok: false, error: `The largest top-up is ${formatPrice(TOPUP_MAX_CENTS)}. Ask us about larger amounts.` }

  try {
    return { ok: true, url: await invoiceUrlForTopUp(provider, profile.id, cents) }
  } catch (err) {
    console.error("[topup] could not open an invoice", err)
    return { ok: false, error: "The payment page could not be opened. Nothing was charged. Try again in a minute." }
  }
}
