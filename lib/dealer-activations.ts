import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Order, OrderItem } from "@/lib/types"
import { phoneKey } from "@/lib/plan-dates"

export type DealerActivation = Pick<OrderItem, "id" | "seq" | "status" | "phone_number" | "iccid" | "tracking_number" | "fulfilled_at" | "plan_starts_on" | "plan_ends_on"> & {
  order: Pick<Order, "id" | "kind" | "number" | "carrier_name" | "plan_name" | "product_type" | "days" | "status" | "phase" | "replacement_of"> & {
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
      `id, seq, status, phone_number, iccid, tracking_number, fulfilled_at, plan_starts_on, plan_ends_on,
       order:orders!order_items_order_id_fkey!inner ( id, kind, number, carrier_name, plan_name, product_type, days, status, phase, replacement_of, dealer_id,
         batch:order_batches ( id, number, reference ) )`
    )
    .eq("order.dealer_id", dealerId)
    // SIM cards with no plan are not lines yet; they show here once activated.
    .neq("order.kind", "card_only")
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
    else query = query.or(
      [
        `phone_number.ilike.%${safe}%`,
        // Any way of writing the number: "646 555 0144" finds "+1 (646) 555-0144".
        ...(phoneKey(safe) && phoneKey(safe)!.length >= 4 ? [`phone_key.ilike.%${phoneKey(safe)}%`] : []),
        `iccid.ilike.%${safe.replace(/\s/g, "")}%`,
        `tracking_number.ilike.%${safe}%`,
      ].join(",")
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as DealerActivation[]
}
