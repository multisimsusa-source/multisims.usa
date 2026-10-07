"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { catalogChanged } from "@/lib/admin/catalog-changed"
import { isUniqueViolation, parseMoney, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { slugify } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

const optionalGb = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 99999) {
      ctx.addIssue({ code: "custom", message: "Enter a number of GB, or leave empty" })
      return z.NEVER
    }
    return n
  })

const planSchema = z.object({
  carrier_id: z.uuid("Choose a carrier"),
  name: z.string().trim().min(1, "Enter the plan name").max(120),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  product_type: z.enum(["esim", "physical"], "Choose eSIM or SIM card"),
  talk: z.string().trim().min(1, "Describe talk, for example Unlimited US talk").max(120),
  sms: z.string().trim().min(1, "Describe text, for example Unlimited US text").max(120),
  data_gb: optionalGb,
  hotspot_gb: optionalGb,
  network: z.string().trim().min(1, "Enter the network, for example 5G / 4G LTE").max(60),
  slowdown_after_gb: optionalGb,
  slowdown_speed: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  countries_covered: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().max(60)).min(1, "List at least one country")),
  summary: z.string().trim().max(200, "Keep the summary under 200 characters"),
  description: z.string().trim().max(5000),
  published: z.boolean(),
})

function readPlan(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "")
  const name = get("name")
  const productType = get("product_type")
  return planSchema.safeParse({
    carrier_id: get("carrier_id"),
    name,
    slug: get("slug").trim() || slugify(`${get("carrier_slug")} ${name} ${productType === "physical" ? "sim" : "esim"}`),
    product_type: productType,
    talk: get("talk"),
    sms: get("sms"),
    data_gb: get("data_unlimited") === "on" ? "" : get("data_gb"),
    hotspot_gb: get("hotspot_gb"),
    network: get("network"),
    slowdown_after_gb: get("slowdown_after_gb"),
    slowdown_speed: get("slowdown_speed"),
    countries_covered: get("countries_covered"),
    summary: get("summary"),
    description: get("description"),
    published: formData.get("published") === "on",
  })
}

export async function createPlan(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = readPlan(formData)
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) }

  const supabase = await createClient()
  // New plans start withdrawn: they need day packages before they can be sold.
  const { data, error } = await supabase
    .from("plans")
    .insert({ ...parsed.data, published: false })
    .select("id")
    .single()
  if (isUniqueViolation(error)) return { ok: false, error: "That URL name is taken", fieldErrors: { slug: "Another plan already uses this URL name" } }
  if (error) return { ok: false, error: error.message }

  catalogChanged()
  redirect(`/admin/plans/${data.id}?created=1`)
}

export async function updatePlan(id: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = readPlan(formData)
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) }

  const supabase = await createClient()
  const { error } = await supabase.from("plans").update(parsed.data).eq("id", id)
  if (isUniqueViolation(error)) return { ok: false, error: "That URL name is taken", fieldErrors: { slug: "Another plan already uses this URL name" } }
  if (error) return { ok: false, error: error.message }

  catalogChanged()
  return { ok: true, message: "Plan saved" }
}

export async function setPlanPublished(id: string, published: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("plans").update({ published }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  catalogChanged()
  return { ok: true, message: published ? "Plan published" : "Plan withdrawn from the site" }
}

export async function deletePlan(id: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("plans").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  catalogChanged()
  redirect("/admin/plans?deleted=1")
}

/* Day packages ----------------------------------------------------------------- */

function readPackage(formData: FormData) {
  const days = Number(formData.get("days"))
  const price = parseMoney(formData.get("price"))
  const wholesale = parseMoney(formData.get("wholesale_price"))
  const fieldErrors: Record<string, string> = {}
  if (!Number.isInteger(days) || days < 1 || days > 365) fieldErrors.days = "Enter whole days, 1 to 365"
  if (price === null || Number.isNaN(price)) fieldErrors.price = "Enter a price, for example 24.00"
  if (wholesale !== null && Number.isNaN(wholesale)) fieldErrors.wholesale_price = "Enter a price or leave empty"
  return { days, price: price ?? 0, wholesale, fieldErrors }
}

export async function addDayPackage(planId: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const pkg = readPackage(formData)
  if (Object.keys(pkg.fieldErrors).length) return { ok: false, error: "Check the package fields", fieldErrors: pkg.fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase.from("day_packages").insert({
    plan_id: planId,
    days: pkg.days,
    price_cents: pkg.price,
    wholesale_price_cents: pkg.wholesale,
  })
  if (isUniqueViolation(error)) return { ok: false, error: `This plan already has a ${pkg.days}-day package`, fieldErrors: { days: "Already exists" } }
  if (error) return { ok: false, error: error.message }

  catalogChanged()
  return { ok: true, message: `${pkg.days}-day package added` }
}

export async function updateDayPackage(id: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const pkg = readPackage(formData)
  if (Object.keys(pkg.fieldErrors).length) return { ok: false, error: "Check the package fields", fieldErrors: pkg.fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase
    .from("day_packages")
    .update({
      days: pkg.days,
      price_cents: pkg.price,
      wholesale_price_cents: pkg.wholesale,
      active: formData.get("active") !== "off",
    })
    .eq("id", id)
  if (isUniqueViolation(error)) return { ok: false, error: `This plan already has a ${pkg.days}-day package`, fieldErrors: { days: "Already exists" } }
  if (error) return { ok: false, error: error.message }

  catalogChanged()
  return { ok: true, message: "Package saved" }
}

export async function setDayPackageActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("day_packages").update({ active }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  catalogChanged()
  return { ok: true, message: active ? "Package on sale" : "Package hidden" }
}

export async function deleteDayPackage(id: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("day_packages").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  catalogChanged()
  return { ok: true, message: "Package removed" }
}
