import { getSessionProfile } from "@/lib/auth"
import { listDealerActivations } from "@/lib/dealer-activations"
import { batchLabel } from "@/lib/dealers"
import { productTypeLabel } from "@/lib/format"
import { customerItemStatus, orderLabel } from "@/lib/orders"
import { toCsv } from "@/lib/staff/customers"
import { createClient } from "@/lib/supabase/server"

/** Every line the dealer has received, for their own records. */
export async function GET() {
  const profile = await getSessionProfile()
  if (profile?.role !== "dealer") return new Response("Not allowed", { status: 403 })
  const rows = await listDealerActivations(await createClient(), profile.id, "", 50_000)
  const csv = toCsv([
    ["Order", "Line", "SIM", "Carrier", "Plan", "Type", "Days", "Status", "Phone number", "ICCID", "Tracking", "Delivered", "Your reference"],
    ...rows.map((r) => [
      r.order.batch ? batchLabel(r.order.batch.number) : "",
      orderLabel(r.order),
      r.seq,
      r.order.carrier_name,
      r.order.plan_name,
      productTypeLabel[r.order.product_type],
      r.order.days,
      r.status === "replaced" ? "Replaced" : customerItemStatus(r.order, r),
      r.phone_number ?? "",
      r.iccid ?? "",
      r.tracking_number ?? "",
      r.fulfilled_at?.slice(0, 10) ?? "",
      r.order.batch?.reference ?? "",
    ]),
  ])
  const date = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multisims-activations-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
