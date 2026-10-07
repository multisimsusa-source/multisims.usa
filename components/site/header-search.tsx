import { PlanSearch, type SearchPlan } from "@/components/site/plan-search"
import { getActiveCarriers, getPublishedPlans } from "@/lib/catalog"
import { dataLabel, formatPrice, hotspotLabel, productTypeLabel } from "@/lib/format"

/**
 * Builds the search index from the cached catalogue (tag "catalog"), so a plan published
 * in admin is searchable on the next request. Small enough to ship whole: one row per plan.
 */
export async function HeaderSearch() {
  const [plans, carriers] = await Promise.all([getPublishedPlans(), getActiveCarriers()])

  const index: SearchPlan[] = plans.map((p) => ({
    slug: p.slug,
    name: p.name,
    carrier: { name: p.carrier.name, logo_path: p.carrier.logo_path },
    productType: p.product_type,
    facts: `${dataLabel(p)}, ${hotspotLabel(p).replace(/^No/, "no")}`,
    from: formatPrice(p.from_price_cents),
    // Only plans that have a hotspot should answer "hotspot".
    search: [
      p.carrier.name,
      p.name,
      productTypeLabel[p.product_type],
      p.product_type === "esim" ? "esim qr" : "sim card physical",
      dataLabel(p),
      p.hotspot_gb ? hotspotLabel(p) : "",
      p.talk,
      p.sms,
      p.network,
      p.summary ?? "",
      ...p.packages.map((pkg) => `${pkg.days} days`),
    ].join(" "),
  }))

  const withPlans = carriers
    .filter((c) => plans.some((p) => p.carrier.id === c.id))
    .map((c) => ({ slug: c.slug, name: c.name, logo_path: c.logo_path }))

  return <PlanSearch plans={index} carriers={withPlans} />
}
