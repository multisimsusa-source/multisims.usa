import type { Plan, ProductType } from "@/lib/types"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function formatPrice(cents: number) {
  return usd.format(cents / 100)
}

export function formatDays(days: number) {
  return days === 1 ? "1 day" : `${days} days`
}

/** "AT&T Unlimited", or "AT&T SIM card" for a card on its own. */
export function orderTitle(o: { carrier_name: string; plan_name: string | null }) {
  return `${o.carrier_name} ${o.plan_name ?? "SIM card"}`
}

/** "AT&T Unlimited eSIM"; no repeat when the name already says it ("Unlimited Starter SIM"). */
export function planFullName(plan: { name: string; product_type: ProductType; carrier: { name: string } }) {
  const says = /\b(e?sim|sim card)$/i.test(plan.name.trim())
  return `${plan.carrier.name} ${plan.name}${says ? "" : ` ${productTypeLabel[plan.product_type]}`}`
}

/** Looks like a phone number: only digits, spaces and + ( ) . -, with 7 to 15 digits. */
export function isPhoneLike(value: string) {
  const digits = value.replace(/\D/g, "")
  return /^[\d\s()+.-]+$/.test(value.trim()) && digits.length >= 7 && digits.length <= 15
}

/**
 * A line's phone number as stored and shown: a US number always reads "+1 (305) 555-0101",
 * however it was typed; any other number stays as typed.
 */
export function tidyPhone(value: string) {
  const v = value.trim()
  const digits = v.replace(/\D/g, "")
  const foreign = v.startsWith("+") && !v.startsWith("+1")
  const us = digits.length === 10 ? digits : digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null
  return us && !foreign ? `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : v
}

export function formatGb(gb: number) {
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
}

export const productTypeLabel: Record<ProductType, string> = {
  esim: "eSIM",
  physical: "SIM card",
}

export function dataLabel(plan: Pick<Plan, "data_gb">) {
  return plan.data_gb === null ? "Unlimited data" : `${formatGb(plan.data_gb)} data`
}

export function hotspotLabel(plan: Pick<Plan, "hotspot_gb">) {
  if (plan.hotspot_gb === null || plan.hotspot_gb === 0) return "No hotspot"
  return `${formatGb(plan.hotspot_gb)} hotspot`
}

export function slowdownLabel(plan: Pick<Plan, "slowdown_after_gb" | "slowdown_speed" | "data_gb">) {
  if (plan.slowdown_after_gb === null) return "No slowdown"
  const speed = plan.slowdown_speed ? ` to ${plan.slowdown_speed}` : ""
  return `Slows${speed} after ${formatGb(plan.slowdown_after_gb)}`
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

/** A payment coin by its short name: usdttrc20 is USDT, usdc is USDC, btc is BTC. */
export function coinName(code: string | null | undefined) {
  if (!code) return ""
  const c = code.toLowerCase()
  if (c.startsWith("usdt")) return "USDT"
  if (c.startsWith("usdc")) return "USDC"
  return c.toUpperCase()
}
