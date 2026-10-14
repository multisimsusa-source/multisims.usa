import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Order, OrderItem, OrderStatus, Payment, Ticket, TicketStatus } from "@/lib/types"

/** Reads for the agent and admin order screens. All run as the signed-in user (RLS: staff). */

export type Person = { id: string; full_name: string; email: string }
export type QueueOrder = Pick<
  Order,
  | "id" | "number" | "status" | "carrier_name" | "plan_name" | "product_type" | "days" | "quantity"
  | "area_code" | "zip_code" | "addon_name" | "paid_at" | "claimed_by" | "claimed_at" | "attention_reason"
  | "replacement_of" | "staff_note" | "created_at"
  | "phase" | "plan_start" | "activate_on" | "activation_requested_at" | "shipped_at"
> & { claimer: Person | null }

const QUEUE_SELECT = `
  id, number, status, carrier_name, plan_name, product_type, days, quantity, area_code, zip_code,
  addon_name, paid_at, claimed_by, claimed_at, attention_reason, replacement_of, staff_note, created_at,
  phase, plan_start, activate_on, activation_requested_at, shipped_at,
  claimer:profiles!orders_claimed_by_fkey ( id, full_name, email )
`

/**
 * Everything open: waiting, being worked on, flagged, or held for approval, plus posted
 * SIM cards with a start date still to come (shown as scheduled).
 */
export async function listOpenOrders(): Promise<QueueOrder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("orders")
    .select(QUEUE_SELECT)
    .or("status.in.(queued,claimed,needs_attention,awaiting_approval),and(status.eq.shipped,plan_start.eq.on_date)")
    .order("paid_at", { ascending: true, nullsFirst: false })
    .limit(500)
  if (error) throw error
  return data as unknown as QueueOrder[]
}

export type OrderFilters = {
  status?: OrderStatus | "open" | "all"
  q?: string
  type?: "esim" | "physical"
  agent?: string
  page?: number
}

export const ORDERS_PAGE_SIZE = 50

export async function listOrders(filters: OrderFilters) {
  const supabase = await createClient()
  let query = supabase
    .from("orders")
    .select(`${QUEUE_SELECT}, customer_name, customer_email, total_cents, refunded_at, fulfilled_at`, { count: "exact" })
    .order("created_at", { ascending: false })

  const status = filters.status ?? "all"
  if (status === "open") query = query.in("status", ["queued", "claimed", "needs_attention", "awaiting_approval"])
  else if (status !== "all") query = query.eq("status", status)
  if (filters.type) query = query.eq("product_type", filters.type)
  if (filters.agent) query = query.eq("claimed_by", filters.agent)

  const q = filters.q?.trim()
  if (q) {
    const number = q.match(/^(?:ms-?)?(\d{4,9})$/i)?.[1]
    if (number) query = query.eq("number", Number(number))
    else {
      const safe = q.replace(/[%,()*\\]/g, " ").slice(0, 80)
      query = query.or(`customer_email.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`)
    }
  }

  const page = Math.max(1, filters.page ?? 1)
  const from = (page - 1) * ORDERS_PAGE_SIZE
  const { data, count, error } = await query.range(from, from + ORDERS_PAGE_SIZE - 1)
  if (error) throw error
  type Row = QueueOrder & Pick<Order, "customer_name" | "customer_email" | "total_cents" | "refunded_at" | "fulfilled_at">
  return { rows: data as unknown as Row[], total: count ?? 0, page }
}

export type WorkItem = OrderItem & { qr_url: string | null }
export type WorkTicket = Pick<Ticket, "id" | "number" | "type_name" | "severity" | "status" | "created_at" | "order_item_id">

export type WorkOrder = {
  order: Order & { claimer: Person | null }
  items: WorkItem[]
  /** For a replacement: the original order and the SIM being replaced. */
  original: (Pick<Order, "id" | "number"> & { item: Pick<OrderItem, "seq" | "phone_number" | "iccid"> | null }) | null
  replacements: Pick<Order, "id" | "number" | "status" | "replaces_item_id" | "created_at">[]
  tickets: WorkTicket[]
  messages: { id: string; message: string; created_at: string }[]
  payments: Payment[]
  allowance: ReplacementAllowance
}

/** Replacements already issued on an order (not counting cancelled ones) against the limit in Settings. */
export type ReplacementAllowance = { used: number; limit: number }

async function getReplacementAllowance(supabase: Awaited<ReturnType<typeof createClient>>, rootId: string): Promise<ReplacementAllowance> {
  const [{ data: settings }, { count }] = await Promise.all([
    supabase.from("settings").select("max_replacements_per_order").maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("replacement_of", rootId).neq("status", "cancelled"),
  ])
  return { used: count ?? 0, limit: settings?.max_replacements_per_order ?? 2 }
}

export async function getWorkOrder(id: string): Promise<WorkOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data: order } = await supabase
    .from("orders")
    .select("*, claimer:profiles!orders_claimed_by_fkey ( id, full_name, email )")
    .eq("id", id)
    .maybeSingle()
  if (!order) return null

  const rootId = (order.replacement_of as string | null) ?? order.id
  const [{ data: items }, { data: replacements }, { data: tickets }, { data: messages }, { data: payments }, original, allowance] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("seq"),
    supabase
      .from("orders")
      .select("id, number, status, replaces_item_id, created_at")
      .eq("replacement_of", order.id)
      .order("created_at"),
    supabase
      .from("tickets")
      .select("id, number, type_name, severity, status, created_at, order_item_id")
      .eq("order_id", rootId)
      .order("created_at", { ascending: false }),
    supabase.from("order_messages").select("id, message, created_at").eq("order_id", rootId).order("created_at"),
    supabase.from("payments").select("*").eq("order_id", id).order("created_at"),
    order.replacement_of
      ? Promise.all([
          supabase.from("orders").select("id, number").eq("id", order.replacement_of).maybeSingle(),
          order.replaces_item_id
            ? supabase.from("order_items").select("seq, phone_number, iccid").eq("id", order.replaces_item_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]).then(([o, i]) => (o.data ? { ...o.data, item: i.data } : null))
      : Promise.resolve(null),
    getReplacementAllowance(supabase, rootId),
  ])

  const rows = (items ?? []) as OrderItem[]
  const paths = rows.map((i) => i.qr_path).filter((p): p is string => Boolean(p))
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data } = await supabase.storage.from("esim-qr").createSignedUrls(paths, 60 * 30)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }

  return {
    order: order as WorkOrder["order"],
    items: rows.map((i) => ({ ...i, qr_url: i.qr_path ? (signed.get(i.qr_path) ?? null) : null })),
    original,
    replacements: replacements ?? [],
    tickets: (tickets ?? []) as WorkTicket[],
    messages: messages ?? [],
    payments: (payments ?? []) as Payment[],
    allowance,
  }
}

export type TicketRow = Ticket & {
  order: Pick<Order, "id" | "number" | "customer_name" | "customer_email" | "carrier_name" | "plan_name" | "product_type" | "public_token">
}

export async function listTickets(status: TicketStatus | "all" | "active" = "active") {
  const supabase = await createClient()
  let query = supabase
    .from("tickets")
    .select("*, order:orders!tickets_order_id_fkey ( id, number, customer_name, customer_email, carrier_name, plan_name, product_type, public_token )")
    .order("created_at", { ascending: false })
    .limit(300)
  if (status === "active") query = query.in("status", ["open", "in_progress"])
  else if (status !== "all") query = query.eq("status", status)
  const { data, error } = await query
  if (error) throw error
  return data as unknown as TicketRow[]
}

export async function getTicket(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*, order:orders!tickets_order_id_fkey ( id, number, customer_name, customer_email, carrier_name, plan_name, product_type, public_token )")
    .eq("id", id)
    .maybeSingle()
  if (!ticket) return null
  const t = ticket as unknown as TicketRow

  const [{ data: items }, { data: replacements }, screenshot, answeredBy, allowance] = await Promise.all([
    supabase.from("order_items").select("id, seq, status, phone_number, iccid").eq("order_id", t.order_id).order("seq"),
    supabase.from("orders").select("id, number, status, replaces_item_id").eq("replacement_of", t.order_id).order("created_at"),
    t.screenshot_path
      ? supabase.storage.from("ticket-screenshots").createSignedUrl(t.screenshot_path, 60 * 30)
      : Promise.resolve({ data: null }),
    t.answered_by ? supabase.from("profiles").select("full_name, email").eq("id", t.answered_by).maybeSingle() : Promise.resolve({ data: null }),
    getReplacementAllowance(supabase, t.order_id),
  ])

  // Delivered SIMs of the replacement orders can be replaced again too.
  const repIds = (replacements ?? []).map((r) => r.id)
  const { data: repItems } = repIds.length
    ? await supabase.from("order_items").select("id, seq, status, phone_number, iccid, order_id").in("order_id", repIds)
    : { data: [] as { id: string; seq: number; status: string; phone_number: string | null; iccid: string | null; order_id: string }[] }

  return {
    ticket: t,
    items: items ?? [],
    replacements: (replacements ?? []) as Pick<Order, "id" | "number" | "status" | "replaces_item_id">[],
    replacementItems: repItems ?? [],
    screenshotUrl: (screenshot.data as { signedUrl?: string } | null)?.signedUrl ?? null,
    answeredBy: answeredBy.data as { full_name: string; email: string } | null,
    allowance,
  }
}

export async function listStaff(): Promise<(Person & { role: "admin" | "agent"; active: boolean })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active")
    .in("role", ["admin", "agent"])
    .order("role")
    .order("full_name")
  if (error) throw error
  return data as (Person & { role: "admin" | "agent"; active: boolean })[]
}

export async function getSettings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("settings")
    .select("owner_email, unclaimed_alert_minutes, shipping_fee_cents, replacement_needs_approval, max_replacements_per_order, sim_card_price_cents, network_fee_cents, min_order_cents")
    .maybeSingle()
  return data ?? { owner_email: null, unclaimed_alert_minutes: 5, shipping_fee_cents: 100, replacement_needs_approval: false, max_replacements_per_order: 2, sim_card_price_cents: 500, network_fee_cents: 300, min_order_cents: 1500 }
}
