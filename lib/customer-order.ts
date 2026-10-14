import "server-only"

import { createServiceClient } from "@/lib/supabase/service"
import type { Order, OrderItem, Ticket, TicketType } from "@/lib/types"

/** How long a QR link on the order page stays valid. Reloading the page issues a new one. */
const QR_URL_SECONDS = 60 * 60

/** The order a SIM belongs to (the original, or its replacement order). */
export type ItemOwner = Pick<Order, "id" | "status" | "phase" | "product_type" | "plan_start" | "activate_on" | "activation_requested_at">

export type CustomerItem = OrderItem & {
  owner: ItemOwner
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
  /** Physical SIMs posted but not yet active: the original order and any replacements. */
  activations: Activation[]
  tickets: Pick<Ticket, "id" | "number" | "type_name" | "severity" | "status" | "answer" | "created_at" | "order_item_id">[]
  ticketTypes: Pick<TicketType, "id" | "name">[]
  lastMessageAt: string | null
}

export type Activation = {
  orderId: string
  /** "Your SIM cards", or "SIM card 2 replacement". */
  label: string
  /** "on_receipt": the customer presses the button; "on_date": it starts by itself. */
  start: "on_receipt" | "on_date"
  activateOn: string | null
  requested: boolean
}

const OWNER_SELECT = "id, status, phase, product_type, plan_start, activate_on, activation_requested_at, replaces_item_id"

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
    .select(OWNER_SELECT)
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
      owner: (rep ?? order) as ItemOwner,
      qr_url: item.status === "fulfilled" && item.qr_path ? (signed.get(item.qr_path) ?? null) : null,
      replacement: Boolean(rep),
      replaces_seq: rep?.replaces_item_id ? (seqById.get(rep.replaces_item_id) ?? null) : null,
    })
  }

  const pendingReplacements = (replacementOrders ?? [])
    .filter((r) => r.status !== "fulfilled" && r.status !== "cancelled" && r.replaces_item_id)
    .map((r) => seqById.get(r.replaces_item_id as string))
    .filter((s): s is number => typeof s === "number")

  const unit = order.product_type === "esim" ? "eSIM" : "SIM card"
  const activations: Activation[] = [order as ItemOwner & { replaces_item_id: string | null }, ...(replacementOrders ?? [])]
    .filter((o) => o.product_type === "physical" && o.phase === "activate" && o.status !== "fulfilled" && o.status !== "cancelled")
    .map((o) => {
      const seq = o.replaces_item_id ? seqById.get(o.replaces_item_id) : null
      return {
        orderId: o.id,
        label: o.id === order.id ? `Your ${order.quantity > 1 ? `${unit}s` : unit}` : `${unit} ${seq ?? ""} replacement`.replace("  ", " "),
        start: o.plan_start === "on_date" ? "on_date" : "on_receipt",
        activateOn: o.activate_on,
        requested: Boolean(o.activation_requested_at),
      }
    })

  return {
    order: order as Order,
    items,
    pendingReplacements,
    activations,
    tickets: tickets ?? [],
    ticketTypes: types ?? [],
    lastMessageAt: lastMessage?.created_at ?? null,
  }
}
