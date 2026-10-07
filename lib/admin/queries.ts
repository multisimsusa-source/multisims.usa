import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Addon, Carrier, DayPackage, Plan } from "@/lib/types"

export type AdminCarrier = Carrier & { plan_count: number }
export type AdminPlanRow = Plan & {
  carrier: Pick<Carrier, "id" | "name" | "slug" | "active" | "logo_path">
  packages: Pick<DayPackage, "id" | "days" | "price_cents" | "active">[]
}

export async function listCarriers(): Promise<AdminCarrier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, slug, logo_path, display_order, fulfilment_mode, active, plans(count)")
    .order("display_order")
    .order("name")
  if (error) throw error
  return data.map(({ plans, ...c }) => ({
    ...c,
    plan_count: (plans as unknown as { count: number }[])[0]?.count ?? 0,
  })) as AdminCarrier[]
}

export async function listPlans(): Promise<AdminPlanRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("plans")
    .select("*, carrier:carriers!inner(id, name, slug, active, logo_path, display_order), packages:day_packages(id, days, price_cents, active)")
    .order("display_order")
  if (error) throw error
  const rows = data as unknown as (AdminPlanRow & { carrier: { display_order: number } })[]
  return rows.sort(
    (a, b) =>
      a.carrier.display_order - b.carrier.display_order ||
      a.carrier.name.localeCompare(b.carrier.name) ||
      a.display_order - b.display_order ||
      a.name.localeCompare(b.name)
  )
}

export async function getAdminPlan(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("plans")
    .select("*, carrier:carriers(id, name, slug, active, logo_path), packages:day_packages(*)")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const plan = data as unknown as Plan & {
    carrier: Pick<Carrier, "id" | "name" | "slug" | "active" | "logo_path">
    packages: DayPackage[]
  }
  plan.packages.sort((a, b) => a.days - b.days)
  return plan
}

export async function listAddons(): Promise<Addon[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("addons").select("*").order("name")
  if (error) throw error
  return data as Addon[]
}

/** Why a plan is not showing on the public site, or null when it is live. */
export function hiddenReason(plan: { published: boolean; carrier: { active: boolean }; packages: { active: boolean }[] }) {
  if (!plan.published) return "Withdrawn"
  if (!plan.carrier.active) return "Carrier hidden"
  if (!plan.packages.some((p) => p.active)) return "No day packages"
  return null
}
