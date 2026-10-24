import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Order, OrderItem } from "@/lib/types"

export type DealerActivation = Pick<OrderItem, "id" | "seq" | "status" | "phone_number" | "iccid" | "tracking_number" | "fulfilled_at"> & {
  order: Pick<Order, "id" | "number" | "carrier_name" | "plan_name" | "product_type" | "days" | "status" | "phase" | "replacement_of"> & {
    batch: { id: string; number: number; reference: string | null } | null
  }
}

/**
 * Every SIM a dealer has received (delivered, posted, or replaced), newest first.
 * Search by phone number, ICCID, tracking, or order number (B-1001 or MS-10001).
 */
export async function listDealerActivations(db: SupabaseClient, dealerId: string, q: string, limit = 300) {
  let query = db
    .from("order_items")
    .select(
      `id, seq, status, phone_number, iccid, tracking_number, fulfilled_at,
       order:orders!order_items_order_id_fkey!inner ( id, number, carrier_name, plan_name, product_type, days, status, phase, replacement_of, dealer_id,
         batch:order_batches ( id, number, reference ) )`
    )
    .eq("order.dealer_id", dealerId)
    .in("status", ["fulfilled", "replaced"])
    .order("fulfilled_at", { ascending: false })
    .limit(limit)

  const term = q.trim()
  if (term) {
    const batch = term.match(/^b-?(\d{4,7})$/i)?.[1]
    // Bare digits are part of a phone number or ICCID; orders need their prefix.
    const order = term.match(/^ms-?(\d{4,9})$/i)?.[1]
    const safe = term.replace(/[%,()*\\]/g, " ").slice(0, 80)
    if (batch) query = query.eq("order.batch.number", Number(batch))
    else if (order) query = query.eq("order.number", Number(order))
    else query = query.or(`phone_number.ilike.%${safe}%,iccid.ilike.%${safe.replace(/\s/g, "")}%,tracking_number.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as DealerActivation[]
}
