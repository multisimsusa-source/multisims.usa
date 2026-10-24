import "server-only"

import { cacheLife, cacheTag } from "next/cache"

import { CATALOG_LIFE } from "@/lib/catalog"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * Reviews the owner chose to feature, for the public site. Cached and tagged "reviews";
 * featuring or un-featuring calls updateTag("reviews"). Never an average or a count:
 * hand-picked reviews must not be summed into a rating.
 */
export const REVIEWS_TAG = "reviews"

export type FeaturedReview = {
  id: string
  rating: number
  comment: string
  display_name: string
  created_at: string
  plan: string
}

export async function getFeaturedReviews(limit = 6): Promise<FeaturedReview[]> {
  "use cache"
  cacheLife(CATALOG_LIFE)
  cacheTag(REVIEWS_TAG)

  const { data, error } = await createServiceClient()
    .from("reviews")
    .select("id, rating, comment, display_name, created_at, order:orders!inner ( carrier_name, plan_name )")
    .eq("featured", true)
    .eq("hidden", false)
    .order("featured_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  type Row = Omit<FeaturedReview, "plan"> & { order: { carrier_name: string; plan_name: string } }
  return ((data ?? []) as unknown as Row[]).map(({ order, ...r }) => ({ ...r, plan: `${order.carrier_name} ${order.plan_name}` }))
}
