import { applyPaymentEvent, getPaymentProvider } from "@/lib/payments"

/**
 * NOWPayments IPN. Unsigned or wrongly signed calls get 401 and change nothing. A
 * verified call is only a trigger: the payment is re-read from NOWPayments before
 * anything is recorded. Any failure after verification answers 500 so NOWPayments
 * sends it again; applying the same event twice is harmless.
 */
export async function POST(request: Request) {
  const provider = getPaymentProvider()
  if (!provider || provider.id !== "nowpayments") return new Response("Payments are not configured", { status: 503 })

  const raw = await request.text()
  if (raw.length > 64_000) return new Response("Too large", { status: 413 })
  if (!provider.verifyWebhook(raw, request.headers)) return new Response("Bad signature", { status: 401 })

  try {
    const event = await provider.confirmWebhook(raw)
    await applyPaymentEvent(provider, event)
  } catch (err) {
    console.error("[payments] nowpayments webhook failed", err)
    return new Response("Try again", { status: 500 })
  }
  return Response.json({ ok: true })
}
