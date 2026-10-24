import { getSessionProfile } from "@/lib/auth"
import { toCsv } from "@/lib/staff/customers"
import { createClient } from "@/lib/supabase/server"

/** The calling destinations as CSV, in the format Replace list reads back. */
export async function GET() {
  const profile = await getSessionProfile()
  if (profile?.role !== "admin") return new Response("Not allowed", { status: 403 })
  const supabase = await createClient()
  const { data } = await supabase.from("addon_destinations").select("name, minutes_cap").order("display_order").order("name").limit(5000)
  const csv = toCsv([["Destination", "Minutes"], ...(data ?? []).map((d) => [d.name, d.minutes_cap === null ? "Unlimited" : d.minutes_cap])])
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="multisims-calling-destinations.csv"',
      "Cache-Control": "no-store",
    },
  })
}
