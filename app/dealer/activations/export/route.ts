import { getSessionProfile } from "@/lib/auth"
import { listDealerActivations } from "@/lib/dealer-activations"
import { batchLabel } from "@/lib/dealers"
import { productTypeLabel } from "@/lib/format"
import { customerItemStatus, orderLabel } from "@/lib/orders"
import { usDate } from "@/lib/plan-dates"
import { csvText, toCsv } from "@/lib/staff/customers"
import { createClient } from "@/lib/supabase/server"

/** Every line the dealer has received, for their own records. */
export async function GET() {
  const profile = await getSessionProfile()
  if (profile?.role !== "dealer")
    return new Response("Not allowed", { status: 403 })
  const rows = await listDealerActivations(
    await createClient(),
    profile.id,
    "",
    50_000
  )
  const csv = toCsv([
    [
      "Order",
      "Line",
      "SIM",
      "Carrier",
      "Plan",
      "Type",
      "Days",
      "Status",
      "Phone number",
      "ICCID",
      "Tracking",
      "Shipped or delivered on",
      "Plan starts",
      "Plan ends",
      "Your reference",
    ],
    ...rows.map((r) => [
      r.order.batch ? batchLabel(r.order.batch.number) : "",
      orderLabel(r.order),
      r.seq,
      r.order.carrier_name,
      r.order.plan_name ?? "SIM card only",
      productTypeLabel[r.order.product_type],
      r.order.days ?? "",
      r.status === "replaced" ? "Replaced" : customerItemStatus(r.order, r),
      csvText(r.phone_number),
      csvText(r.iccid),
      csvText(r.tracking_number),
      usDate(r.fulfilled_at),
      r.plan_starts_on ?? "",
      r.plan_ends_on ?? "",
      r.order.batch?.reference ?? "",
    ]),
  ])
  const date = usDate(new Date().toISOString())
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multisims-activations-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
