import "server-only"

import { cacheLife, cacheTag } from "next/cache"

import { createServiceClient } from "@/lib/supabase/service"
import type { Addon, Carrier, CatalogPlan } from "@/lib/types"

/**
 * Public catalogue reads. Cached and tagged "catalog"; every admin mutation calls
 * updateTag("catalog"), so changes reach the public site on the next request.
 * Visibility rule: carrier active, plan published, at least one active day package.
 */
export const CATALOG_TAG = "catalog"

const PLAN_SELECT = `
  id, carrier_id, name, slug, product_type, talk, sms, data_gb, hotspot_gb, network,
  slowdown_after_gb, slowdown_speed, countries_covered, summary, description, published,
  display_order, updated_at,
  carrier:carriers!inner ( id, name, slug, logo_path, active, display_order ),
  packages:day_packages ( id, days, price_cents, active )
`

type PlanRow = Omit<CatalogPlan, "carrier" | "packages" | "from_price_cents"> & {
  carrier: CatalogPlan["carrier"] & { active: boolean; display_order: number }
  packages: (CatalogPlan["packages"][number] & { active: boolean })[]
}

function toCatalogPlan(row: PlanRow): CatalogPlan | null {
  const packages = row.packages
    .filter((p) => p.active)
    .sort((a, b) => a.days - b.days)
    .map(({ id, days, price_cents }) => ({ id, days, price_cents }))
  if (!row.published || !row.carrier.active || packages.length === 0) return null
  const { carrier, ...plan } = row
  return {
    ...plan,
    data_gb: plan.data_gb === null ? null : Number(plan.data_gb),
    hotspot_gb: plan.hotspot_gb === null ? null : Number(plan.hotspot_gb),
    slowdown_after_gb: plan.slowdown_after_gb === null ? null : Number(plan.slowdown_after_gb),
    carrier: { id: carrier.id, name: carrier.name, slug: carrier.slug, logo_path: carrier.logo_path },
    packages,
    from_price_cents: Math.min(...packages.map((p) => p.price_cents)),
  }
}

export async function getPublishedPlans(): Promise<CatalogPlan[]> {
  "use cache"
  cacheLife("max")
  cacheTag(CATALOG_TAG)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_SELECT)
    .eq("published", true)
    .eq("carrier.active", true)
    .order("display_order")
  if (error) throw error

  const rows = data as unknown as PlanRow[]
  return rows
    .sort(
      (a, b) =>
        a.carrier.display_order - b.carrier.display_order ||
        a.carrier.name.localeCompare(b.carrier.name) ||
        a.display_order - b.display_order
    )
    .map(toCatalogPlan)
    .filter((p): p is CatalogPlan => p !== null)
}

export async function getPlanBySlug(slug: string): Promise<CatalogPlan | null> {
  const plans = await getPublishedPlans()
  return plans.find((p) => p.slug === slug) ?? null
}

/** Active carriers that have at least one visible plan, in display order. */
export async function getActiveCarriers(): Promise<Pick<Carrier, "id" | "name" | "slug" | "logo_path">[]> {
  "use cache"
  cacheLife("max")
  cacheTag(CATALOG_TAG)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, slug, logo_path")
    .eq("active", true)
    .order("display_order")
    .order("name")
  if (error) throw error
  return data
}

export async function getActiveAddons(): Promise<Pick<Addon, "id" | "code" | "name" | "description" | "price_cents">[]> {
  "use cache"
  cacheLife("max")
  cacheTag(CATALOG_TAG)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("addons")
    .select("id, code, name, description, price_cents")
    .eq("active", true)
    .order("name")
  if (error) throw error
  return data
}

export async function getIntlCallingAddon() {
  const addons = await getActiveAddons()
  return addons.find((a) => a.code === "intl_calling") ?? null
}
