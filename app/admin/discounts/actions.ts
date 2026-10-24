"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { isUniqueViolation, parseMoney, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,30}$/, "3 to 30 letters, numbers, - or _"),
  kind: z.enum(["percent", "fixed"]),
  carrier_id: z.union([z.literal(""), z.uuid()]),
  starts_on: z.union([z.literal(""), z.iso.date("Choose a date")]),
  ends_on: z.union([z.literal(""), z.iso.date("Choose a date")]),
  max_uses: z.union([z.literal(""), z.coerce.number().int("Whole number").min(1, "At least 1").max(100000)]),
  note: z.string().trim().max(200),
})

/** Dates are whole US days: from the start of the first to the end of the last. */
function usDayStart(date: string) {
  return new Date(`${date}T00:00:00-05:00`).toISOString()
}

export async function createDiscountCode(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])))
  const fieldErrors: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error.issues)
  const kind = parsed.success ? parsed.data.kind : formData.get("kind")
  let value: number | null = null
  if (kind === "percent") {
    const n = Number(formData.get("value"))
    if (!Number.isInteger(n) || n < 1 || n > 90) fieldErrors.value = "Enter 1 to 90"
    else value = n
  } else {
    const cents = parseMoney(formData.get("value"))
    if (cents === null || Number.isNaN(cents) || cents <= 0) fieldErrors.value = "Enter an amount, for example 5.00"
    else value = cents
  }
  if (parsed.success && parsed.data.starts_on && parsed.data.ends_on && parsed.data.ends_on < parsed.data.starts_on) {
    fieldErrors.ends_on = "Ends before it starts"
  }
  if (!parsed.success || value === null || Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted fields", fieldErrors }

  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from("discount_codes").insert({
    code: d.code.toUpperCase(),
    kind: d.kind,
    value,
    carrier_id: d.carrier_id || null,
    starts_at: d.starts_on ? usDayStart(d.starts_on) : null,
    // The whole last day counts: it ends at the start of the next.
    ends_at: d.ends_on ? new Date(new Date(usDayStart(d.ends_on)).getTime() + 86_400_000).toISOString() : null,
    max_uses: d.max_uses === "" ? null : d.max_uses,
    note: d.note,
  })
  if (isUniqueViolation(error)) return { ok: false, error: "That code already exists", fieldErrors: { code: "Already exists" } }
  if (error) return { ok: false, error: "Could not save the code. Try again." }
  refresh()
  return { ok: true, message: `${d.code.toUpperCase()} is ready` }
}

export async function setDiscountActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown code" }
  const supabase = await createClient()
  const { error } = await supabase.from("discount_codes").update({ active }).eq("id", id)
  if (error) return { ok: false, error: "Could not save. Try again." }
  refresh()
  return { ok: true, message: active ? "Code switched on" : "Code switched off" }
}

/** Only a code nobody has used can be removed; a used one is switched off instead, to keep the record. */
export async function deleteDiscountCode(id: string): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown code" }
  const supabase = await createClient()
  const { data, error } = await supabase.from("discount_codes").delete().eq("id", id).eq("uses", 0).select("id")
  if (error) return { ok: false, error: "Could not remove it. Try again." }
  if (!data?.length) return { ok: false, error: "This code has been used, so it stays on record. Switch it off instead." }
  refresh()
  return { ok: true, message: "Code removed" }
}
