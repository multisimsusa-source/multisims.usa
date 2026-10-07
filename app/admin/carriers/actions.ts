"use server"

import { z } from "zod"

import { catalogChanged } from "@/lib/admin/catalog-changed"
import { isUniqueViolation, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { slugify } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const LOGO_MAX_BYTES = 1024 * 1024

const carrierSchema = z.object({
  name: z.string().trim().min(1, "Enter the carrier name").max(80),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  fulfilment_mode: z.enum(["manual", "api"]),
  active: z.boolean(),
})

function readCarrier(formData: FormData) {
  const name = String(formData.get("name") ?? "")
  const slugInput = String(formData.get("slug") ?? "").trim()
  return carrierSchema.safeParse({
    name,
    slug: slugInput || slugify(name),
    // Carrier APIs arrive in a later phase; the field is stored but only manual is offered.
    fulfilment_mode: "manual",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  })
}

function readLogo(formData: FormData): File | null | { error: string } {
  const file = formData.get("logo")
  if (!(file instanceof File) || file.size === 0) return null
  if (!LOGO_TYPES[file.type]) return { error: "Logo must be a PNG, JPG or WebP image" }
  if (file.size > LOGO_MAX_BYTES) return { error: "Logo must be 1 MB or smaller" }
  return file
}

async function uploadLogo(supabase: Awaited<ReturnType<typeof createClient>>, carrierId: string, file: File) {
  const path = `${carrierId}/${Date.now()}.${LOGO_TYPES[file.type]}`
  const { error } = await supabase.storage
    .from("carrier-logos")
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })
  if (error) throw error
  return path
}

export async function createCarrier(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = readCarrier(formData)
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) }
  const logo = readLogo(formData)
  if (logo && "error" in logo) return { ok: false, error: logo.error, fieldErrors: { logo: logo.error } }

  const supabase = await createClient()
  const { data: last } = await supabase
    .from("carriers")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from("carriers")
    .insert({ ...parsed.data, display_order: (last?.display_order ?? 0) + 10 })
    .select("id")
    .single()
  if (isUniqueViolation(error)) return { ok: false, error: "That URL name is taken", fieldErrors: { slug: "Another carrier already uses this URL name" } }
  if (error) return { ok: false, error: error.message }

  if (logo) {
    try {
      const logo_path = await uploadLogo(supabase, data.id, logo)
      await supabase.from("carriers").update({ logo_path }).eq("id", data.id)
    } catch {
      catalogChanged()
      return { ok: false, error: "Carrier saved, but the logo upload failed. Try uploading it again." }
    }
  }

  catalogChanged()
  return { ok: true, message: `${parsed.data.name} added`, id: data.id }
}

export async function updateCarrier(id: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = readCarrier(formData)
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) }
  const logo = readLogo(formData)
  if (logo && "error" in logo) return { ok: false, error: logo.error, fieldErrors: { logo: logo.error } }

  const supabase = await createClient()
  const { data: current } = await supabase.from("carriers").select("logo_path").eq("id", id).single()

  let logo_path: string | null | undefined
  if (logo) {
    try {
      logo_path = await uploadLogo(supabase, id, logo)
    } catch {
      return { ok: false, error: "Logo upload failed. Try again." }
    }
  } else if (formData.get("remove_logo") === "on") {
    logo_path = null
  }

  const { error } = await supabase
    .from("carriers")
    .update({ ...parsed.data, ...(logo_path !== undefined ? { logo_path } : {}) })
    .eq("id", id)
  if (isUniqueViolation(error)) return { ok: false, error: "That URL name is taken", fieldErrors: { slug: "Another carrier already uses this URL name" } }
  if (error) return { ok: false, error: error.message }

  if (logo_path !== undefined && current?.logo_path) {
    await supabase.storage.from("carrier-logos").remove([current.logo_path])
  }

  catalogChanged()
  return { ok: true, message: "Carrier saved" }
}

export async function setCarrierActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("carriers").update({ active }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  catalogChanged()
  return { ok: true, message: active ? "Carrier shown on the site" : "Carrier hidden from the site" }
}

export async function moveCarrier(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from("carriers")
    .select("id, display_order")
    .order("display_order")
    .order("name")
  if (error) return { ok: false, error: error.message }

  const ids = rows.map((r) => r.id)
  const index = ids.indexOf(id)
  const target = direction === "up" ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= ids.length) return { ok: true }
  ;[ids[index], ids[target]] = [ids[target], ids[index]]

  // Rewrite the whole order in steps of 10 so gaps never collide.
  const results = await Promise.all(
    ids.map((carrierId, i) => supabase.from("carriers").update({ display_order: (i + 1) * 10 }).eq("id", carrierId))
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return { ok: false, error: failed.error.message }

  catalogChanged()
  return { ok: true }
}

export async function deleteCarrier(id: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { data: current } = await supabase.from("carriers").select("name, logo_path").eq("id", id).single()
  const { error } = await supabase.from("carriers").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  if (current?.logo_path) await supabase.storage.from("carrier-logos").remove([current.logo_path])
  catalogChanged()
  return { ok: true, message: `${current?.name ?? "Carrier"} removed, with its plans` }
}
