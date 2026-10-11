import "server-only"

import { createClient } from "@/lib/supabase/server"

export type CustomerContact = {
  email: string
  name: string
  phone: string
  orders: number
  spent_cents: number
  first_order_at: string
  last_order_at: string
}

/** Website customers, one row per email (the customer_contacts view; admin RLS applies). */
export async function listCustomers(q = "", limit = 5000): Promise<CustomerContact[]> {
  const supabase = await createClient()
  let query = supabase.from("customer_contacts").select("*").order("last_order_at", { ascending: false }).limit(limit)
  const safe = q.trim().replace(/[%,()*\\]/g, " ").slice(0, 80)
  if (safe) query = query.or(`email.ilike.%${safe}%,name.ilike.%${safe}%,phone.ilike.%${safe}%`)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CustomerContact[]
}

/** RFC 4180 CSV. Cells starting with = + - @ are prefixed so spreadsheets never run them. */
export function toCsv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let s = String(cell ?? "")
          if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(",")
    )
    .join("\r\n")
}
