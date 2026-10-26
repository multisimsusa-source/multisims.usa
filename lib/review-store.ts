import "server-only"

import { updateTag } from "next/cache"

import { REVIEWS_TAG } from "@/lib/reviews"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * Creates or changes a review of an order (itemId null) or of one SIM. Callers check who
 * may rate what first; this runs with the service role. A changed review comes off the
 * website: the owner sees the new words before featuring it again.
 */
export async function writeReview(input: {
  orderId: string
  itemId: string | null
  rating: number
  comment: string
  displayName: string
}): Promise<"created" | "updated" | "failed"> {
  const db = createServiceClient()
  const existing = input.itemId
    ? db.from("reviews").select("id, featured").eq("order_item_id", input.itemId)
    : db.from("reviews").select("id, featured").eq("order_id", input.orderId).is("order_item_id", null)
  const { data: found } = await existing.maybeSingle()

  if (!found) {
    const { error } = await db.from("reviews").insert({
      order_id: input.orderId,
      order_item_id: input.itemId,
      rating: input.rating,
      comment: input.comment,
      display_name: input.displayName,
    })
    // Two taps at once: the first one won, so this one becomes an edit.
    if (error?.code === "23505") return writeReview(input)
    if (error) {
      console.error("[review] insert failed", error)
      return "failed"
    }
    return "created"
  }

  const { error } = await db
    .from("reviews")
    .update({
      rating: input.rating,
      comment: input.comment,
      updated_at: new Date().toISOString(),
      featured: false,
      featured_at: null,
    })
    .eq("id", found.id)
  if (error) {
    console.error("[review] update failed", error)
    return "failed"
  }
  if (found.featured) updateTag(REVIEWS_TAG)
  return "updated"
}
