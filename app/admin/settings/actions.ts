"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { isUniqueViolation, parseMoney, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  owner_email: z.union([z.literal(""), z.email("Enter a valid email")]),
  unclaimed_alert_minutes: z.coerce.number().int("Whole minutes").min(1, "At least 1 minute").max(120, "At most 120 minutes"),
  replacement_needs_approval: z.boolean(),
  max_replacements_per_order: z.coerce.number().int("Whole number").min(0, "At least 0").max(20, "At most 20"),
})

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = schema.safeParse({
    owner_email: String(formData.get("owner_email") ?? "").trim().toLowerCase(),
    unclaimed_alert_minutes: formData.get("unclaimed_alert_minutes"),
    replacement_needs_approval: formData.get("replacement_needs_approval") === "on",
    max_replacements_per_order: formData.get("max_replacements_per_order"),
  })
  const money = {
    shipping_fee_cents: parseMoney(formData.get("shipping_fee")),
    sim_card_price_cents: parseMoney(formData.get("sim_card_price")),
    network_fee_cents: parseMoney(formData.get("network_fee")),
    min_order_cents: parseMoney(formData.get("min_order")),
    dealer_sim_card_price_cents: parseMoney(formData.get("dealer_sim_card_price")),
  }
  const fieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error.issues)
  const fieldFor = { shipping_fee_cents: "shipping_fee", sim_card_price_cents: "sim_card_price", network_fee_cents: "network_fee", min_order_cents: "min_order", dealer_sim_card_price_cents: "dealer_sim_card_price" } as const
  for (const [key, cents] of Object.entries(money) as [keyof typeof money, number | null][]) {
    if (cents === null || Number.isNaN(cents)) fieldErrors[fieldFor[key]] = "Enter an amount, for example 5.00"
    else if (cents > 100_000) fieldErrors[fieldFor[key]] = "At most $1,000"
  }
  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted fields", fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase
    .from("settings")
    .update({ ...parsed.data, ...money, owner_email: parsed.data.owner_email || null })
    .eq("id", true)
  if (error) return { ok: false, error: "Could not save. Try again." }
  refresh()
  return { ok: true, message: "Settings saved" }
}

const typeName = z.string().trim().min(2, "Enter a name").max(80, "Keep it under 80 characters")

export async function addTicketType(name: string): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = typeName.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data: last } = await supabase.from("ticket_types").select("display_order").order("display_order", { ascending: false }).limit(1).maybeSingle()
  const { error } = await supabase.from("ticket_types").insert({ name: parsed.data, display_order: (last?.display_order ?? 0) + 1 })
  if (error) return { ok: false, error: isUniqueViolation(error) ? "That issue type already exists" : "Could not add it" }
  refresh()
  return { ok: true, message: "Issue type added" }
}

export async function updateTicketType(id: string, name: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = typeName.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from("ticket_types").update({ name: parsed.data, active }).eq("id", id)
  if (error) return { ok: false, error: isUniqueViolation(error) ? "That issue type already exists" : "Could not save it" }
  refresh()
  return { ok: true, message: active ? "Saved" : "Hidden from the ticket form" }
}
