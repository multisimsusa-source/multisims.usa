import type { MetadataRoute } from "next"

import { getPublishedPlans } from "@/lib/catalog"
import { absoluteUrl } from "@/lib/site"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const plans = await getPublishedPlans()
  const staticPages = ["/", "/plans", "/about", "/faq", "/contact"].map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" || path === "/plans" ? ("daily" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : path === "/plans" ? 0.9 : 0.5,
  }))
  return [
    ...staticPages,
    ...plans.map((plan) => ({
      url: absoluteUrl(`/plans/${plan.slug}`),
      lastModified: new Date(plan.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ]
}
