import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { lineTimer, phoneKey, type LineTimer, type PlanWindow } from "@/lib/plan-dates"

const CHUNK = 100

type Sim = { id: string; phone_number: string | null; iccid: string | null; plan_starts_on: string | null; plan_ends_on: string | null }

/**
 * The timer for each SIM: its own plan dates together with every refill bought for the same
 * line, so the original order page shows the days a refill added. The same line means the
 * same carrier, and the same ICCID, or the same number when the ICCIDs do not disagree (as
 * match_line in the database). Reads with the client given (service role for the customer
 * page, the dealer's own rows for dealers).
 */
export async function getLineTimers(db: SupabaseClient, sims: Sim[]): Promise<Map<string, LineTimer>> {
  // A dealer line can hold 500 SIMs: ask in groups, so no request URL gets too long.
  if (sims.length > CHUNK) {
    const out = new Map<string, LineTimer>()
    for (let i = 0; i < sims.length; i += CHUNK) {
      for (const [id, timer] of await getLineTimers(db, sims.slice(i, i + CHUNK))) out.set(id, timer)
    }
    return out
  }
  const out = new Map<string, LineTimer>()
  if (!sims.length) return out
  const keys = [...new Set(sims.map((s) => phoneKey(s.phone_number)).filter((k): k is string => Boolean(k)))]
  const iccids = [...new Set(sims.map((s) => s.iccid).filter((k): k is string => Boolean(k)))]
  type Related = Sim & { phone_key: string | null; order: { carrier_id: string } | null }
  let related: Related[] = []
  const carrierOf = new Map<string, string>()
  // Two links join SIMs and orders (a replacement points at the SIM it replaces): name ours.
  const { data: own, error: ownError } = await db
    .from("order_items")
    .select("id, order:orders!order_items_order_id_fkey!inner(carrier_id)")
    .in("id", sims.map((s) => s.id))
  if (ownError) throw ownError
  for (const r of (own ?? []) as unknown as { id: string; order: { carrier_id: string } | null }[]) {
    if (r.order) carrierOf.set(r.id, r.order.carrier_id)
  }
  if (keys.length || iccids.length) {
    const filters = [
      keys.length ? `phone_key.in.(${keys.join(",")})` : null,
      iccids.length ? `iccid.in.(${iccids.map((i) => i.replace(/[^0-9A-Za-z]/g, "")).join(",")})` : null,
    ].filter(Boolean)
    const { data, error } = await db
      .from("order_items")
      .select("id, phone_number, phone_key, iccid, plan_starts_on, plan_ends_on, order:orders!order_items_order_id_fkey!inner(carrier_id)")
      .in("status", ["fulfilled", "replaced"])
      .not("plan_ends_on", "is", null)
      .or(filters.join(","))
      .limit(2000)
    if (error) throw error
    related = (data ?? []) as unknown as Related[]
  }
  for (const sim of sims) {
    const key = phoneKey(sim.phone_number)
    const carrier = carrierOf.get(sim.id)
    const sameLine = (r: Related) =>
      r.id === sim.id ||
      (r.order?.carrier_id === carrier &&
        ((sim.iccid && r.iccid === sim.iccid) || (key && r.phone_key === key && (!sim.iccid || !r.iccid || r.iccid === sim.iccid))))
    const windows: PlanWindow[] = related
      .filter(sameLine)
      .map((r) => ({ starts_on: r.plan_starts_on ?? r.plan_ends_on!, ends_on: r.plan_ends_on! }))
    if (sim.plan_ends_on && !related.some((r) => r.id === sim.id))
      windows.push({ starts_on: sim.plan_starts_on ?? sim.plan_ends_on, ends_on: sim.plan_ends_on })
    if (windows.length) out.set(sim.id, lineTimer(windows))
  }
  return out
}
