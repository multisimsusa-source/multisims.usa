import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { customerOrderStatus, type CustomerStatus } from "@/lib/orders"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order, OrderItem, ProductType } from "@/lib/types"

/** What a dealer can order, at their own prices (from dealer_catalog). */
export type DealerCatalogRow = {
  day_package_id: string
  plan_id: string
  carrier_id: string
  carrier_name: string
  plan_name: string
  plan_slug: string
  product_type: ProductType
  days: number
  price_cents: number
  retail_price_cents: number
}

/** Prices that apply to a whole order rather than one package. */
export type OrderingTerms = {
  shipping_fee_cents: number
  sim_card_price_cents: number
  /** Null when international calling is not offered to dealers (no wholesale price). */
  calling_price_cents: number | null
}

export async function getDealerCatalog(db: SupabaseClient): Promise<DealerCatalogRow[]> {
  const { data } = await db.rpc("dealer_catalog")
  return (data ?? []) as DealerCatalogRow[]
}

/**
 * Settings and add-ons are not readable by dealers, so these few numbers are read with the
 * service role, for the signed-in dealer only. place_dealer_batch re-reads them anyway.
 */
export async function getOrderingTerms(dealerId: string): Promise<OrderingTerms> {
  const db = createServiceClient()
  const [{ data: settings }, { data: dealer }, { data: addon }] = await Promise.all([
    db.from("settings").select("shipping_fee_cents, dealer_sim_card_price_cents").eq("id", true).maybeSingle(),
    db.from("dealers").select("sim_card_price_cents").eq("profile_id", dealerId).maybeSingle(),
    db.from("addons").select("wholesale_price_cents, active").eq("code", "intl_calling").maybeSingle(),
  ])
  return {
    shipping_fee_cents: settings?.shipping_fee_cents ?? 0,
    sim_card_price_cents: dealer?.sim_card_price_cents ?? settings?.dealer_sim_card_price_cents ?? 0,
    calling_price_cents: addon?.active ? (addon.wholesale_price_cents ?? null) : null,
  }
}

export type BatchOrder = Pick<
  Order,
  | "id"
  | "number"
  | "status"
  | "phase"
  | "product_type"
  | "carrier_name"
  | "plan_name"
  | "days"
  | "addon_name"
  | "quantity"
  | "unit_price_cents"
  | "addon_price_cents"
  | "sim_card_price_cents"
  | "shipping_cents"
  | "total_cents"
  | "replacement_of"
  | "replaces_item_id"
  | "activation_requested_at"
  | "created_at"
>

export type Batch = {
  id: string
  number: number
  reference: string | null
  shipping_address: Order["shipping_address"]
  total_cents: number
  created_at: string
  orders: BatchOrder[]
}

export type BatchProgress = { delivered: number; total: number; status: CustomerStatus }

const orderColumns =
  "id, number, status, phase, product_type, carrier_name, plan_name, days, addon_name, quantity, unit_price_cents, addon_price_cents, sim_card_price_cents, shipping_cents, total_cents, replacement_of, replaces_item_id, activation_requested_at, created_at"

/** The dealer's batches, newest first, with their orders. RLS keeps it to their own. */
export async function listBatches(db: SupabaseClient, dealerId: string, limit = 50): Promise<Batch[]> {
  const { data } = await db
    .from("order_batches")
    .select(`id, number, reference, shipping_address, total_cents, created_at, orders(${orderColumns})`)
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false })
    .limit(limit)
  return ((data ?? []) as Batch[]).map((b) => ({ ...b, orders: b.orders.filter((o) => !o.replacement_of).sort((x, y) => x.number - y.number) }))
}

export async function getBatch(db: SupabaseClient, batchId: string): Promise<Batch | null> {
  const { data } = await db
    .from("order_batches")
    .select(`id, number, reference, shipping_address, total_cents, created_at, orders(${orderColumns})`)
    .eq("id", batchId)
    .maybeSingle()
  if (!data) return null
  const batch = data as Batch
  return { ...batch, orders: batch.orders.sort((x, y) => x.number - y.number) }
}

export type BatchItem = Pick<OrderItem, "id" | "order_id" | "seq" | "status" | "phone_number" | "iccid" | "qr_path" | "tracking_number" | "fulfilled_at">

export async function listBatchItems(db: SupabaseClient, orderIds: string[]): Promise<BatchItem[]> {
  if (!orderIds.length) return []
  const { data } = await db
    .from("order_items")
    .select("id, order_id, seq, status, phone_number, iccid, qr_path, tracking_number, fulfilled_at")
    .in("order_id", orderIds)
    .order("seq")
    .limit(5000)
  return (data ?? []) as BatchItem[]
}

/**
 * How far a batch has come, in the customer's words. SIMs count as delivered once the
 * line is live (eSIM QR sent, SIM card activated); cancelled lines do not count.
 */
export function batchProgress(orders: BatchOrder[]): BatchProgress {
  const live = orders.filter((o) => o.status !== "cancelled" && !o.replacement_of)
  if (!live.length) return { delivered: 0, total: 0, status: "Cancelled" }
  const statuses = live.map((o) => customerOrderStatus(o))
  const total = live.reduce((n, o) => n + o.quantity, 0)
  const delivered = live.reduce((n, o, i) => n + (statuses[i] === "Delivered" ? o.quantity : 0), 0)
  const status: CustomerStatus = statuses.every((s) => s === "Delivered")
    ? "Delivered"
    : statuses.some((s) => s === "Processing")
      ? "Processing"
      : "Shipped"
  return { delivered, total, status }
}
