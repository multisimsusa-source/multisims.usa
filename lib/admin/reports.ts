import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Numbers for the owner's dashboard and reports. Days are US Eastern days (where the
 * business runs). Everything is read through the owner's session, so RLS applies.
 *
 * Definitions, used the same way everywhere:
 * - Sales: orders paid in the range, not cancelled, replacements excluded (they are free).
 * - SIMs delivered: SIMs delivered (eSIM) or posted (SIM card) in the range, replacements excluded.
 * - Tickets: opened in the range. Replacements: issued in the range.
 */

export const US_TZ = "America/New_York"

export type Range = { from: string; to: string; label: string }
export type ReportFilters = { carrier?: string; dealer?: string; agent?: string; channel?: "website" | "dealer" }

/** YYYY-MM-DD for a moment, in US Eastern time. */
export function usDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: US_TZ }).format(d)
}

/** The instant a US Eastern day starts, as ISO (daylight saving handled). */
export function usDayStart(date: string) {
  const noonUtc = new Date(`${date}T12:00:00Z`)
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: US_TZ, timeZoneName: "longOffset" })
    .formatToParts(noonUtc)
    .find((p) => p.type === "timeZoneName")
    ?.value.replace("GMT", "") || "-05:00"
  return new Date(`${date}T00:00:00${offset}`).toISOString()
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
] as const

/** The range in the URL: a preset, or custom from/to dates. Defaults to the last 30 days. */
export function resolveRange(params: Record<string, string>, now = new Date()): Range {
  const today = usDate(now)
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)
  const from = valid(params.from)
  const to = valid(params.to)
  if (params.range === "custom" && from && to && from <= to) return { from, to, label: `${from} to ${to}` }
  switch (params.range) {
    case "today":
      return { from: today, to: today, label: "Today" }
    case "7d":
      return { from: addDays(today, -6), to: today, label: "Last 7 days" }
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today, label: "This month" }
    default:
      return { from: addDays(today, -29), to: today, label: "Last 30 days" }
  }
}

export function rangeDays(range: Range) {
  const out: string[] = []
  for (let d = range.from; d <= range.to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

type OrderRow = {
  id: string
  channel: "website" | "dealer"
  status: string
  product_type: "esim" | "physical"
  carrier_id: string | null
  carrier_name: string
  dealer_id: string | null
  quantity: number
  total_cents: number
  paid_at: string
  claimed_by: string | null
}

type ItemRow = {
  id: string
  fulfilled_at: string
  fulfilled_by: string | null
  order: { carrier_id: string | null; carrier_name: string; channel: "website" | "dealer"; dealer_id: string | null; product_type: "esim" | "physical"; replacement_of: string | null }
}

export type ReportData = Awaited<ReturnType<typeof loadReport>>

/** Everything the dashboard and reports need for one range and set of filters. */
export async function loadReport(range: Range, filters: ReportFilters = {}) {
  const supabase = await createClient()
  const start = usDayStart(range.from)
  const end = usDayStart(addDays(range.to, 1))

  let orders = supabase
    .from("orders")
    .select("id, channel, status, product_type, carrier_id, carrier_name, dealer_id, quantity, total_cents, paid_at, claimed_by")
    .is("replacement_of", null)
    .neq("status", "cancelled")
    .gte("paid_at", start)
    .lt("paid_at", end)
    .limit(50_000)
  let items = supabase
    .from("order_items")
    .select("id, fulfilled_at, fulfilled_by, order:orders!order_items_order_id_fkey!inner ( carrier_id, carrier_name, channel, dealer_id, product_type, replacement_of )")
    .in("status", ["fulfilled", "replaced"])
    .gte("fulfilled_at", start)
    .lt("fulfilled_at", end)
    .limit(100_000)
  let tickets = supabase
    .from("tickets")
    .select("id, order:orders!tickets_order_id_fkey!inner ( carrier_id, carrier_name, channel, dealer_id )")
    .gte("created_at", start)
    .lt("created_at", end)
    .limit(50_000)
  let replacements = supabase
    .from("orders")
    .select("id, carrier_id, carrier_name, channel, dealer_id, claimed_by")
    .not("replacement_of", "is", null)
    .gte("created_at", start)
    .lt("created_at", end)
    .limit(50_000)

  if (filters.carrier) {
    orders = orders.eq("carrier_id", filters.carrier)
    items = items.eq("order.carrier_id", filters.carrier)
    tickets = tickets.eq("order.carrier_id", filters.carrier)
    replacements = replacements.eq("carrier_id", filters.carrier)
  }
  if (filters.channel) {
    orders = orders.eq("channel", filters.channel)
    items = items.eq("order.channel", filters.channel)
    tickets = tickets.eq("order.channel", filters.channel)
    replacements = replacements.eq("channel", filters.channel)
  }
  if (filters.dealer) {
    orders = orders.eq("dealer_id", filters.dealer)
    items = items.eq("order.dealer_id", filters.dealer)
    tickets = tickets.eq("order.dealer_id", filters.dealer)
    replacements = replacements.eq("dealer_id", filters.dealer)
  }
  if (filters.agent) {
    orders = orders.eq("claimed_by", filters.agent)
    items = items.eq("fulfilled_by", filters.agent)
    replacements = replacements.eq("claimed_by", filters.agent)
  }

  const [o, i, t, r, staff, dealers, ledger, open] = await Promise.all([
    orders,
    items,
    tickets,
    replacements,
    supabase.from("profiles").select("id, full_name, email, role, active").in("role", ["agent", "admin"]),
    supabase.from("dealers").select("profile_id, company"),
    supabase.from("wallet_ledger").select("dealer_id, kind, amount_cents").in("kind", ["topup", "manual_add", "capture"]).gte("created_at", start).lt("created_at", end).limit(50_000),
    supabase.from("orders").select("id, status, quantity, claimed_by").in("status", ["queued", "claimed", "needs_attention"]).limit(5000),
  ])
  for (const res of [o, i, t, r]) if (res.error) throw res.error

  return {
    range,
    orders: (o.data ?? []) as OrderRow[],
    items: ((i.data ?? []) as unknown as ItemRow[]).filter((x) => !x.order.replacement_of),
    tickets: (t.data ?? []) as unknown as { id: string; order: { carrier_id: string | null; carrier_name: string } }[],
    replacements: (r.data ?? []) as { id: string; carrier_id: string | null; carrier_name: string }[],
    staff: (staff.data ?? []) as { id: string; full_name: string; email: string; role: string; active: boolean }[],
    dealers: (dealers.data ?? []) as { profile_id: string; company: string }[],
    ledger: (ledger.data ?? []) as { dealer_id: string; kind: string; amount_cents: number }[],
    open: (open.data ?? []) as { id: string; status: string; quantity: number; claimed_by: string | null }[],
  }
}

/* ---------- aggregations ------------------------------------------------------------------ */

export function salesTotals(data: ReportData) {
  const website = data.orders.filter((o) => o.channel === "website").reduce((n, o) => n + o.total_cents, 0)
  const dealer = data.orders.filter((o) => o.channel === "dealer").reduce((n, o) => n + o.total_cents, 0)
  return { website, dealer, total: website + dealer, orders: data.orders.length }
}

/** Sales per US day, split by channel, every day in the range present (zeros included). */
export function salesByDay(data: ReportData) {
  const byDay = new Map(rangeDays(data.range).map((d) => [d, { day: d, website: 0, dealer: 0 }]))
  for (const o of data.orders) {
    const row = byDay.get(usDate(new Date(o.paid_at)))
    if (row) row[o.channel] += o.total_cents / 100
  }
  return [...byDay.values()]
}

export type CarrierRow = { carrier: string; orders: number; sims: number; salesCents: number; delivered: number; tickets: number; replacements: number }

/** One row per carrier: sales, SIMs delivered, tickets and replacements. */
export function byCarrier(data: ReportData): CarrierRow[] {
  const rows = new Map<string, CarrierRow>()
  const row = (name: string) => {
    let r = rows.get(name)
    if (!r) rows.set(name, (r = { carrier: name, orders: 0, sims: 0, salesCents: 0, delivered: 0, tickets: 0, replacements: 0 }))
    return r
  }
  for (const o of data.orders) {
    const r = row(o.carrier_name)
    r.orders += 1
    r.sims += o.quantity
    r.salesCents += o.total_cents
  }
  for (const i of data.items) row(i.order.carrier_name).delivered += 1
  for (const t of data.tickets) row(t.order.carrier_name).tickets += 1
  for (const x of data.replacements) row(x.carrier_name).replacements += 1
  return [...rows.values()].sort((a, b) => b.salesCents - a.salesCents || b.delivered - a.delivered)
}

export type AgentRow = { id: string; name: string; filled: number; holding: number }

/** What each agent (and the owner, when they fill orders) did in the range, and holds now. */
export function byAgent(data: ReportData): AgentRow[] {
  return data.staff
    .map((s) => ({
      id: s.id,
      name: s.full_name || s.email,
      filled: data.items.filter((i) => i.fulfilled_by === s.id).length,
      holding: data.open.filter((o) => o.claimed_by === s.id && o.status !== "queued").length,
    }))
    .filter((a) => a.filled > 0 || a.holding > 0 || data.staff.find((s) => s.id === a.id)?.role === "agent")
    .sort((a, b) => b.filled - a.filled)
}

export type DealerRow = { id: string; company: string; orders: number; sims: number; orderedCents: number; takenCents: number; fundedCents: number }

/** What each dealer ordered, was charged (SIMs delivered) and paid in, in the range. */
export function byDealer(data: ReportData): DealerRow[] {
  return data.dealers
    .map((d) => {
      const own = data.orders.filter((o) => o.dealer_id === d.profile_id)
      const ledger = data.ledger.filter((l) => l.dealer_id === d.profile_id)
      return {
        id: d.profile_id,
        company: d.company,
        orders: own.length,
        sims: own.reduce((n, o) => n + o.quantity, 0),
        orderedCents: own.reduce((n, o) => n + o.total_cents, 0),
        takenCents: ledger.filter((l) => l.kind === "capture").reduce((n, l) => n + l.amount_cents, 0),
        fundedCents: ledger.filter((l) => l.kind !== "capture").reduce((n, l) => n + l.amount_cents, 0),
      }
    })
    .sort((a, b) => b.orderedCents - a.orderedCents || a.company.localeCompare(b.company))
}

export function waitingNow(data: ReportData) {
  const queued = data.open.filter((o) => o.status === "queued")
  return {
    queued: queued.length,
    queuedSims: queued.reduce((n, o) => n + o.quantity, 0),
    attention: data.open.filter((o) => o.status === "needs_attention").length,
  }
}

/** The period of the same length just before this one, for comparisons. */
export function previousRange(range: Range): Range {
  const days = rangeDays(range).length
  const to = addDays(range.from, -1)
  return { from: addDays(to, -(days - 1)), to, label: `previous ${days === 1 ? "day" : `${days} days`}` }
}

/** Per-day counts or sums across the range (oldest first), for KPI trends. */
export function perDay(data: ReportData, metric: "sales" | "orders" | "delivered") {
  const days = new Map(rangeDays(data.range).map((d) => [d, 0]))
  if (metric === "delivered") {
    for (const i of data.items) {
      const d = usDate(new Date(i.fulfilled_at))
      if (days.has(d)) days.set(d, days.get(d)! + 1)
    }
  } else {
    for (const o of data.orders) {
      const d = usDate(new Date(o.paid_at))
      if (days.has(d)) days.set(d, days.get(d)! + (metric === "sales" ? o.total_cents : 1))
    }
  }
  return [...days.values()]
}
