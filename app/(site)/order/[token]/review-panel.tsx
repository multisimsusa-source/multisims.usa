"use client"

import { RatingForm } from "@/components/patterns/rating-form"
import { CUSTOMER_CONSENT, type GivenReview } from "@/lib/review-rules"
import { saveReview } from "./actions"

/** Once the order is delivered (a SIM card: once it arrived): stars and a comment, changeable later. */
export function ReviewPanel({
  token,
  given,
  physical,
}: {
  token: string
  given: GivenReview | null
  physical: boolean
}) {
  return (
    <RatingForm
      action={saveReview.bind(null, token, null)}
      given={given}
      title="How was your order?"
      description={
        physical
          ? "Rate it from 1 to 5 stars, from ordering to getting your SIM card. It takes a few seconds."
          : "Rate it from 1 to 5 stars. It takes a few seconds."
      }
      consent={CUSTOMER_CONSENT}
      thanks="Thanks for rating your order"
    />
  )
}
