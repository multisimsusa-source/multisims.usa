import "server-only"

import { createServiceClient } from "@/lib/supabase/service"
import type { Order, OrderItem, Ticket, TicketType } from "@/lib/types"

/** How long a QR link on the order page stays valid. Reloading the page issues a new one. */
const QR_URL_SECONDS = 60 * 60

export type CustomerItem = OrderItem & {
  qr_url: string | null
  /** Set on items of a replacement order: which original SIM it replaces. */
  replaces_seq: number | null
  replacement: boolean
}

export type CustomerOrder = {
  order: Order
  items: CustomerItem[]
  /** Replacements still being prepared, by the original SIM's number. */
  pendingReplacements: number[]
  tickets: Pick<Ticket, "id" | "number" | "type_name" | "severity" | "status" | "answer" | "created_at" | "order_item_id">[]
  ticketTypes: Pick<TicketType, "id" | "name">[]
  lastMessageAt: string | null
}

export function isOrderToken(token: string) {
  return /^[0-9a-f]{48}$/.test(token)
}

/**
 * Everything the private order page shows. Customers have no database access of their
 * own; this runs with the service role and is keyed only by the unguessable token.
 */
export async function getCustomerOrder(token: string): Promise<CustomerOrder | null> {
  if (!isOrderToken(token)) return null
  const db = createServiceClient()

  const { data: order } = await db.from("orders").select("*").eq("public_token", token).maybeSingle()
  if (!order || order.replacement_of) return null // replacements live on the original's page

  const { data: replacementOrders } = await db
    .from("orders")
    .select("id, status, replaces_item_id")
    .eq("replacement_of", order.id)
    .order("created_at")

  const orderIds = [order.id, ...(replacementOrders ?? []).map((r) => r.id)]
  const [{ data: itemRows }, { data: tickets }, { data: types }, { data: lastMessage }] = await Promise.all([
    db.from("order_items").select("*").in("order_id", orderIds).order("seq"),
    db
      .from("tickets")
      .select("id, number, type_name, severity, status, answer, created_at, order_item_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false }),
    db.from("ticket_types").select("id, name").eq("active", true).order("display_order"),
    db.from("order_messages").select("created_at").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])

  const all = (itemRows ?? []) as OrderItem[]
  const seqById = new Map(all.filter((i) => i.order_id === order.id).map((i) => [i.id, i.seq]))
  const replacementById = new Map((replacementOrders ?? []).map((r) => [r.id, r]))

  // Only delivered QR codes get a link; pending, replaced and cancelled ones never do.
  const qrPaths = all.filter((i) => i.status === "fulfilled" && i.qr_path).map((i) => i.qr_path as string)
  const signed = new Map<string, string>()
  if (qrPaths.length) {
    const { data } = await db.storage.from("esim-qr").createSignedUrls(qrPaths, QR_URL_SECONDS)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }

  const items: CustomerItem[] = []
  for (const item of all) {
    const rep = replacementById.get(item.order_id)
    if (rep && item.status !== "fulfilled") continue
    items.push({
      ...item,
      qr_url: item.status === "fulfilled" && item.qr_path ? (signed.get(item.qr_path) ?? null) : null,
      replacement: Boolean(rep),
      replaces_seq: rep?.replaces_item_id ? (seqById.get(rep.replaces_item_id) ?? null) : null,
    })
  }

  const pendingReplacements = (replacementOrders ?? [])
    .filter((r) => r.status !== "fulfilled" && r.status !== "cancelled" && r.replaces_item_id)
    .map((r) => seqById.get(r.replaces_item_id as string))
    .filter((s): s is number => typeof s === "number")

  return {
    order: order as Order,
    items,
    pendingReplacements,
    tickets: tickets ?? [],
    ticketTypes: types ?? [],
    lastMessageAt: lastMessage?.created_at ?? null,
  }
}
