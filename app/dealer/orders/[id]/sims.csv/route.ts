import { z } from "zod"

import { getSessionProfile } from "@/lib/auth"
import { getBatch, listBatchItems } from "@/lib/dealer-orders"
import { batchLabel } from "@/lib/dealers"
import { productTypeLabel } from "@/lib/format"
import { customerItemStatus, orderLabel } from "@/lib/orders"
import { toCsv } from "@/lib/staff/customers"
import { createClient } from "@/lib/supabase/server"

/** Every SIM in one of the dealer's orders, for their own records or resale system. */
export async function GET(_request: Request, { params }: RouteContext<"/dealer/orders/[id]/sims.csv">) {
  const profile = await getSessionProfile()
  if (profile?.role !== "dealer") return new Response("Not allowed", { status: 403 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 })

  const supabase = await createClient()
  const batch = await getBatch(supabase, id)
  if (!batch) return new Response("Not found", { status: 404 })
  const items = await listBatchItems(
    supabase,
    batch.orders.map((o) => o.id)
  )
  const orderById = new Map(batch.orders.map((o) => [o.id, o]))
  items.sort((a, b) => orderById.get(a.order_id)!.number - orderById.get(b.order_id)!.number || a.seq - b.seq)

  const csv = toCsv([
    ["Order", "Line", "SIM", "Carrier", "Plan", "Type", "Days", "Status", "Phone number", "ICCID", "Tracking", "Delivered"],
    ...items.map((item) => {
      const o = orderById.get(item.order_id)!
      return [
        batchLabel(batch.number),
        orderLabel(o),
        item.seq,
        o.carrier_name,
        o.plan_name,
        productTypeLabel[o.product_type],
        o.days,
        item.status === "replaced" ? "Replaced" : customerItemStatus(o, item),
        item.phone_number ?? "",
        item.iccid ?? "",
        item.tracking_number ?? "",
        item.fulfilled_at?.slice(0, 10) ?? "",
      ]
    }),
  ])
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multisims-${batchLabel(batch.number)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
