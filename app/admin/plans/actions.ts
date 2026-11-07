"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { catalogChanged } from "@/lib/admin/catalog-changed"
import { dbFailed, isUniqueViolation, parseMoney, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { slugify } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

const optionalGb = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null
    if (v === "missing") {
      ctx.addIssue({ code: "custom", message: "Enter the data allowance in GB, or switch on Unlimited" })
      return z.NEVER
    }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 99999) {
      ctx.addIssue({ code: "custom", message: "Enter a number of GB, or leave empty" })
      return z.NEVER
    }
    return n
  })

const planSchema = z.object({
  carrier_id: z.uuid("Choose a carrier"),
  name: z.string().trim().min(1, "Enter the plan name").max(120, "Keep the name under 120 characters"),
  slug: z
    .string()
    .trim()
    .max(80, "Keep the URL name under 80 characters")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  product_type: z.enum(["esim", "physical"], "Choose eSIM or SIM card"),
  plan_type: z.enum(["daily", "monthly"], "Choose daily or monthly"),
  talk: z.string().trim().min(1, "Describe talk, for example Unlimited US talk").max(120, "Keep it under 120 characters"),
  sms: z.string().trim().min(1, "Describe text, for example Unlimited US text").max(120, "Keep it under 120 characters"),
  data_gb: optionalGb,
  hotspot_gb: optionalGb,
  network: z.string().trim().min(1, "Enter the network, for example 5G / 4G LTE").max(60, "Keep it under 60 characters"),
  slowdown_after_gb: optionalGb,
  slowdown_speed: z
    .string()
    .trim()
    .max(40, "Keep it under 40 characters")
    .transform((v) => v || null),
  countries_covered: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().max(60, "Keep each country under 60 characters")).min(1, "List at least one country")),
  summary: z.string().trim().max(200, "Keep the summary under 200 characters"),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters"),
  published: z.boolean(),
  refillable: z.boolean(),
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
    plan_type: get("plan_type") || "daily",
    talk: get("talk"),
    sms: get("sms"),
    data_gb: get("data_unlimited") === "on" ? "" : get("data_gb").trim() || "missing",
    hotspot_gb: get("hotspot_gb"),
    network: get("network"),
    slowdown_after_gb: get("slowdown_after_gb"),
    slowdown_speed: get("slowdown_speed"),
    countries_covered: get("countries_covered"),
    summary: get("summary"),
    description: get("description"),
    published: formData.get("published") === "on",
    refillable: formData.get("refillable") === "on",
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
  if (error) return dbFailed(error)

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
  if (error) return dbFailed(error)

  catalogChanged()
  return { ok: true, message: "Plan saved" }
}

export async function setPlanPublished(id: string, published: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("plans").update({ published }).eq("id", id)
  if (error) return dbFailed(error)
  catalogChanged()
  return { ok: true, message: published ? "Plan published" : "Plan withdrawn from the site" }
}

export async function deletePlan(id: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("plans").delete().eq("id", id)
  if (error) return dbFailed(error)
  catalogChanged()
  redirect("/admin/plans?deleted=1")
}

/* Day packages ----------------------------------------------------------------- */

function readPackage(formData: FormData) {
  const days = Number(formData.get("days"))
  const price = parseMoney(formData.get("price"))
  const wholesale = parseMoney(formData.get("wholesale_price"))
  const sale = parseMoney(formData.get("sale_price"))
  const fieldErrors: Record<string, string> = {}
  if (!Number.isInteger(days) || days < 1 || days > 365) fieldErrors.days = "Enter whole days, 1 to 365"
  if (price === null || Number.isNaN(price)) fieldErrors.price = "Enter a price, for example 24.00"
  else if (price <= 0) fieldErrors.price = "A price must be above $0.00"
  if (wholesale !== null && Number.isNaN(wholesale)) fieldErrors.wholesale_price = "Enter a price or leave empty"
  else if (wholesale !== null && wholesale <= 0) fieldErrors.wholesale_price = "Above $0.00, or leave empty"
  if (sale !== null && Number.isNaN(sale)) fieldErrors.sale_price = "Enter a price or leave empty"
  else if (sale !== null && sale <= 0) fieldErrors.sale_price = "Above $0.00, or leave empty"
  else if (sale !== null && price !== null && !Number.isNaN(price) && sale >= price) fieldErrors.sale_price = "A sale price must be below the price"
  return { days, price: price ?? 0, wholesale, sale, fieldErrors }
}

export async function addDayPackage(planId: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const pkg = readPackage(formData)
  if (Object.keys(pkg.fieldErrors).length) return { ok: false, error: Object.values(pkg.fieldErrors)[0], fieldErrors: pkg.fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase.from("day_packages").insert({
    plan_id: planId,
    days: pkg.days,
    price_cents: pkg.price,
    wholesale_price_cents: pkg.wholesale,
    sale_price_cents: pkg.sale,
  })
  if (isUniqueViolation(error)) return { ok: false, error: `This plan already has a ${pkg.days}-day package`, fieldErrors: { days: "Already exists" } }
  if (error) return dbFailed(error)

  catalogChanged()
  return { ok: true, message: `${pkg.days}-day package added` }
}

export async function updateDayPackage(id: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const pkg = readPackage(formData)
  if (Object.keys(pkg.fieldErrors).length) return { ok: false, error: Object.values(pkg.fieldErrors)[0], fieldErrors: pkg.fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase
    .from("day_packages")
    .update({
      days: pkg.days,
      price_cents: pkg.price,
      wholesale_price_cents: pkg.wholesale,
      sale_price_cents: pkg.sale,
      active: formData.get("active") !== "off",
    })
    .eq("id", id)
  if (isUniqueViolation(error)) return { ok: false, error: `This plan already has a ${pkg.days}-day package`, fieldErrors: { days: "Already exists" } }
  if (error) return dbFailed(error)

  catalogChanged()
  return { ok: true, message: "Package saved" }
}

export async function setDayPackageActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("day_packages").update({ active }).eq("id", id)
  if (error) return dbFailed(error)
  catalogChanged()
  return { ok: true, message: active ? "Package on sale" : "Package hidden" }
}

export async function deleteDayPackage(id: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.from("day_packages").delete().eq("id", id)
  if (error) return dbFailed(error)
  catalogChanged()
  return { ok: true, message: "Package removed" }
}
