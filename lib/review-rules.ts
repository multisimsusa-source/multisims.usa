import { z } from "zod"

import type { Order, OrderItem } from "@/lib/types"

/** The consent line under the comment, for customers and for dealers. */
export const CUSTOMER_CONSENT = "We may show your rating, comment and first name on our website."
export const DEALER_CONSENT = "Only the MultiSims USA team sees dealer ratings."

/** A review as its author sees it: of the whole order, or of one SIM. */
export type GivenReview = { rating: number; comment: string; updated_at: string | null }

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars"),
  comment: z.string().trim().max(500, "Keep it under 500 characters"),
})

type RateableOrder = Pick<Order, "status" | "product_type" | "phase" | "activation_requested_at">

/**
 * When an order can be rated. Delivered orders always; a posted SIM card as soon as it is
 * in the buyer's hands (they pressed "it arrived", or the chosen start date came), so a
 * line that is never started, or starts weeks later, can still be rated.
 */
export function orderRateable(order: RateableOrder) {
  if (order.status === "fulfilled") return true
  return (
    order.product_type === "physical" &&
    order.phase === "activate" &&
    order.status !== "cancelled" &&
    Boolean(order.activation_requested_at)
  )
}

/** One SIM can be rated once its order can, including a SIM that was later replaced. */
export function itemRateable(owner: RateableOrder, item: Pick<OrderItem, "status">) {
  return orderRateable(owner) && (item.status === "fulfilled" || item.status === "replaced")
}
