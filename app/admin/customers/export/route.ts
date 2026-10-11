import { getSessionProfile } from "@/lib/auth"
import { listCustomers, toCsv } from "@/lib/staff/customers"

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
      c.phone,
      c.orders,
      (c.spent_cents / 100).toFixed(2),
      c.first_order_at.slice(0, 10),
      c.last_order_at.slice(0, 10),
    ]),
  ])
  const date = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multisims-customers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
