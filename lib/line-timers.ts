import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { lineTimer, phoneKey, type LineTimer, type PlanWindow } from "@/lib/plan-dates"

type Sim = { id: string; phone_number: string | null; iccid: string | null; plan_starts_on: string | null; plan_ends_on: string | null }

/**
 * The timer for each SIM: its own plan dates together with every refill bought for the same
 * number or ICCID, so the original order page shows the days a refill added. Reads with the
 * client given (service role for the customer page, the dealer's own rows for dealers).
 */
export async function getLineTimers(db: SupabaseClient, sims: Sim[]): Promise<Map<string, LineTimer>> {
  const out = new Map<string, LineTimer>()
  const keys = [...new Set(sims.map((s) => phoneKey(s.phone_number)).filter((k): k is string => Boolean(k)))]
  const iccids = [...new Set(sims.map((s) => s.iccid).filter((k): k is string => Boolean(k)))]
  let related: (Sim & { phone_key: string | null })[] = []
  if (keys.length || iccids.length) {
    const filters = [
      keys.length ? `phone_key.in.(${keys.join(",")})` : null,
      iccids.length ? `iccid.in.(${iccids.map((i) => i.replace(/[^0-9A-Za-z]/g, "")).join(",")})` : null,
    ].filter(Boolean)
    const { data } = await db
      .from("order_items")
      .select("id, phone_number, phone_key, iccid, plan_starts_on, plan_ends_on")
      .in("status", ["fulfilled", "replaced"])
      .not("plan_ends_on", "is", null)
      .or(filters.join(","))
      .limit(2000)
    related = (data ?? []) as typeof related
  }
  for (const sim of sims) {
    const key = phoneKey(sim.phone_number)
    const windows: PlanWindow[] = related
      .filter((r) => r.id === sim.id || (key && r.phone_key === key) || (sim.iccid && r.iccid === sim.iccid))
      .map((r) => ({ starts_on: r.plan_starts_on ?? r.plan_ends_on!, ends_on: r.plan_ends_on! }))
    if (sim.plan_ends_on && !related.some((r) => r.id === sim.id))
      windows.push({ starts_on: sim.plan_starts_on ?? sim.plan_ends_on, ends_on: sim.plan_ends_on })
    if (windows.length) out.set(sim.id, lineTimer(windows))
  }
  return out
}
