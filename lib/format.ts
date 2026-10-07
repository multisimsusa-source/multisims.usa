import type { Plan, ProductType } from "@/lib/types"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function formatPrice(cents: number) {
  return usd.format(cents / 100)
}

export function formatDays(days: number) {
  return days === 1 ? "1 day" : `${days} days`
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
