import type { AdminCarrier, AdminPlanRow } from "@/lib/admin/queries"
import { hiddenReason } from "@/lib/admin/queries"

export type CarrierMixRow = { carrier: string; esim: number; physical: number; total: number }
export type PriceLadderRow = { days: number; min: number; median: number; max: number; range: [number, number]; plans: number }
export type PerDayRow = { days: number; label: string; perDay: number }

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Live plans per shown carrier, split by product. Carrier order follows admin order. */
export function carrierMix(carriers: AdminCarrier[], plans: AdminPlanRow[]): CarrierMixRow[] {
  const live = plans.filter((p) => !hiddenReason(p))
  return carriers
    .filter((c) => c.active)
    .map((c) => {
      const own = live.filter((p) => p.carrier.id === c.id)
      const esim = own.filter((p) => p.product_type === "esim").length
      const physical = own.length - esim
      return { carrier: c.name, esim, physical, total: own.length }
    })
    .filter((r) => r.total > 0)
}

/** Lowest, median and highest price for each package length across live plans (USD). */
export function priceLadder(plans: AdminPlanRow[]): PriceLadderRow[] {
  const byDays = new Map<number, number[]>()
  for (const plan of plans) {
    if (hiddenReason(plan)) continue
    for (const pkg of plan.packages) {
      if (!pkg.active) continue
      const list = byDays.get(pkg.days) ?? []
      list.push(pkg.price_cents / 100)
      byDays.set(pkg.days, list)
    }
  }
  return [...byDays.entries()]
    .sort(([a], [b]) => a - b)
    .map(([days, prices]) => {
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      return { days, min, max, median: round2(median(prices)), range: [min, max] as [number, number], plans: prices.length }
    })
}

/** Median price per day for each package length, to show the long-stay discount. */
export function pricePerDay(ladder: PriceLadderRow[]): PerDayRow[] {
  return ladder.map((r) => ({ days: r.days, label: r.days === 1 ? "1 day" : `${r.days} days`, perDay: round2(r.median / r.days) }))
}
