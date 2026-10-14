import { formatDays } from "@/lib/format"
import type { Order } from "@/lib/types"

/**
 * One place for the order total, used by checkout (browser and server), the order page
 * and the emails, so every screen adds up the same way:
 *
 *   plan        = (day package + international calling) x quantity
 *   SIM cards   = SIM card price x quantity          (physical only)
 *   shipping    = flat, once per order                (physical only)
 *   network fee = flat, once per order                (every order)
 */
export type PriceInput = {
  unitCents: number
  addonCents: number
  quantity: number
  physical: boolean
  simCardCents: number
  shippingCents: number
  networkFeeCents: number
}

export function orderTotal(p: PriceInput) {
  const plan = (p.unitCents + p.addonCents) * p.quantity
  const simCards = p.physical ? p.simCardCents * p.quantity : 0
  const shipping = p.physical ? p.shippingCents : 0
  return plan + simCards + shipping + p.networkFeeCents
}

export type PriceLine = { key: string; label: string; cents: number }

type LineSource = Pick<
  Order,
  | "carrier_name" | "plan_name" | "days" | "quantity" | "product_type" | "addon_name"
  | "unit_price_cents" | "addon_price_cents" | "sim_card_price_cents" | "shipping_cents" | "network_fee_cents"
>

/** The lines of an order as stored on it. Lines that do not apply are left out. */
export function orderLines(o: LineSource): PriceLine[] {
  const physical = o.product_type === "physical"
  const lines: PriceLine[] = [
    { key: "plan", label: `${o.carrier_name} ${o.plan_name}, ${formatDays(o.days)} x ${o.quantity}`, cents: o.unit_price_cents * o.quantity },
  ]
  if (o.addon_name) lines.push({ key: "addon", label: `${o.addon_name} x ${o.quantity}`, cents: o.addon_price_cents * o.quantity })
  if (physical && o.sim_card_price_cents > 0) lines.push({ key: "sim", label: `SIM card x ${o.quantity}`, cents: o.sim_card_price_cents * o.quantity })
  if (physical) lines.push({ key: "shipping", label: "Shipping", cents: o.shipping_cents })
  if (o.network_fee_cents > 0) lines.push({ key: "network", label: "Network fee", cents: o.network_fee_cents })
  return lines
}

/** Whole dollars, rounded up: "Minimum order is $21." reads better than $20.03. */
export function roundUpToDollar(cents: number) {
  return Math.ceil(cents / 100) * 100
}

/** The checkout block message, with the minimum actually in use. */
export function minimumOrderMessage(minimumCents: number) {
  return `Minimum order is $${(minimumCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}. Add more days or another SIM.`
}
