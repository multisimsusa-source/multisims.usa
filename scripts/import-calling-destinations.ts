/**
 * Loads the international calling destinations from the carrier's rate table PDF.
 *   bun scripts/import-calling-destinations.ts "docs/MVNO MSU International Calling destination and caps.pdf" [--dry-run]
 * Needs pdftotext (poppler). Replaces the whole list for the international calling add-on.
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

import { parseDestinations } from "../lib/calling-destinations"

const [file, flag] = process.argv.slice(2)
if (!file) {
  console.error('Usage: bun scripts/import-calling-destinations.ts <rate-table.pdf | .txt | .csv> [--dry-run]')
  process.exit(1)
}

const text = file.toLowerCase().endsWith(".pdf") ? execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }) : readFileSync(file, "utf8")
const destinations = parseDestinations(text)
const unlimited = destinations.filter((d) => d.minutes_cap === null).length
console.log(`Read ${destinations.length} destinations (${unlimited} unlimited).`)
if (flag === "--dry-run") {
  for (const d of destinations.slice(0, 15)) console.log(`  ${d.name}: ${d.minutes_cap ?? "Unlimited"}`)
  process.exit(0)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data: addon, error: addonError } = await supabase.from("addons").select("id").eq("code", "intl_calling").single()
if (addonError || !addon) throw addonError ?? new Error("No intl_calling add-on")

const { error: deleteError } = await supabase.from("addon_destinations").delete().eq("addon_id", addon.id)
if (deleteError) throw deleteError
const rows = destinations.map((d, i) => ({ addon_id: addon.id, name: d.name, minutes_cap: d.minutes_cap, display_order: i }))
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase.from("addon_destinations").insert(rows.slice(i, i + 500))
  if (error) throw error
}
console.log(`Saved ${rows.length} destinations.`)
