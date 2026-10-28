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
  const typed = q.trim()
  const safe = typed.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  // Only symbols: nothing to look for.
  if (typed && !safe) return []
  if (safe) query = query.or(`email.ilike.%${safe}%,name.ilike.%${safe}%,phone.ilike.%${safe}%`)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CustomerContact[]
}

/**
 * A number to keep exactly as written (phone numbers, ICCIDs, tracking numbers): Excel would
 * otherwise read "+1 305 ..." as a formula and turn a 19-digit ICCID into 8.90E+18.
 */
export type CsvText = { text: string }
export const csvText = (value: string | null | undefined): CsvText | string => (value ? { text: value } : "")

/**
 * RFC 4180 CSV. Cells starting with = + - @ are prefixed so spreadsheets never run them. A
 * csvText cell made only of digits, spaces and + ( ) . - is written as ="..." so spreadsheets
 * show it as text; anything else in it is treated like any other cell.
 */
export function toCsv(rows: (string | number | CsvText)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (typeof cell === "object" && cell !== null) {
            if (/^[0-9+() .-]+$/.test(cell.text)) return `"=""${cell.text}"""`
            cell = cell.text
          }
          let s = String(cell ?? "")
          if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(",")
    )
    .join("\r\n")
}
