import { getSessionProfile } from "@/lib/auth"
import { usDate } from "@/lib/plan-dates"
import { csvText, listCustomers, toCsv } from "@/lib/staff/customers"

/** CSV of website customers for the owner's own use. We never send marketing email. */
export async function GET() {
  const profile = await getSessionProfile()
  if (profile?.role !== "admin") return new Response("Not allowed", { status: 403 })

  const customers = await listCustomers("", 100_000)
  const csv = toCsv([
    ["Name", "Email", "Phone", "Orders", "Spent (USD)", "First order", "Last order"],
    ...customers.map((c) => [
      c.name,
      c.email,
      csvText(c.phone),
      c.orders,
      (c.spent_cents / 100).toFixed(2),
      usDate(c.first_order_at),
      usDate(c.last_order_at),
    ]),
  ])
  const date = usDate(new Date().toISOString())
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multisims-customers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
