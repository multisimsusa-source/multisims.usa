"use server"

import { z } from "zod"

import { catalogChanged } from "@/lib/admin/catalog-changed"
import { parseMoney, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { parseDestinations } from "@/lib/calling-destinations"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z.string().trim().max(300, "Keep it under 300 characters"),
})

export async function updateAddon(id: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = schema.safeParse({ name: formData.get("name"), description: formData.get("description") })
  const price = parseMoney(formData.get("price"))
  const wholesale = parseMoney(formData.get("wholesale_price"))

  const fieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error.issues)
  if (price === null || Number.isNaN(price)) fieldErrors.price = "Enter a price, for example 5.00"
  if (wholesale !== null && Number.isNaN(wholesale)) fieldErrors.wholesale_price = "Enter a price or leave empty"
  if (!parsed.success || Object.keys(fieldErrors).length) {
    return { ok: false, error: "Check the highlighted fields", fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("addons")
    .update({
      ...parsed.data,
      price_cents: price,
      wholesale_price_cents: wholesale,
      active: formData.get("active") === "on",
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  catalogChanged()
  return { ok: true, message: "Add-on saved" }
}

/**
 * Replaces the international calling destinations with a pasted list: the carrier's rate
 * table copied from its PDF, or CSV lines of "Destination,Minutes" (a number or Unlimited).
 */
export async function replaceDestinations(addonId: string, text: string): Promise<ActionResult> {
  await requireRole("admin")
  const destinations = parseDestinations(text)
  if (destinations.length < 1) return { ok: false, error: "No destinations found. Use one line per destination: name, then minutes or Unlimited." }
  if (destinations.length > 2000) return { ok: false, error: "That is more than 2,000 lines. Check the list." }

  const supabase = await createClient()
  const { error: deleteError } = await supabase.from("addon_destinations").delete().eq("addon_id", addonId)
  if (deleteError) return { ok: false, error: "Could not replace the list. Try again." }
  const rows = destinations.map((d, i) => ({ addon_id: addonId, name: d.name, minutes_cap: d.minutes_cap, display_order: i }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("addon_destinations").insert(rows.slice(i, i + 500))
    if (error) return { ok: false, error: "Part of the list did not save. Paste it again." }
  }
  catalogChanged()
  return { ok: true, message: `Saved ${destinations.length} destinations` }
}
