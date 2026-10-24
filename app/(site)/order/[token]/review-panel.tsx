"use client"

import * as React from "react"
import { CheckCircleIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Notice } from "@/components/patterns/notice"
import { StarRatingInput, Stars } from "@/components/patterns/star-rating"
import type { FormState } from "@/lib/form-state"
import { submitReview } from "./actions"

/** After delivery: stars and an optional comment, once per order. */
export function ReviewPanel({
  token,
  given,
}: {
  token: string
  given: { rating: number; comment: string } | null
}) {
  const [state, action, pending] = React.useActionState<FormState, FormData>(
    submitReview.bind(null, token),
    { status: "idle" }
  )
  const [rating, setRating] = React.useState(Number(state.values?.rating) || 0)

  if (given || state.status === "success") {
    return (
      <div
        id="rate"
        role="status"
        className="scroll-mt-24 rounded-xl border bg-card p-5 sm:p-6"
      >
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircleIcon weight="fill" className="size-5 text-success-ink" />
          Thanks for rating your order
        </p>
        {given ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            You gave it <Stars rating={given.rating} />
          </p>
        ) : state.message ? (
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        ) : null}
      </div>
    )
  }

  const errors = state.fieldErrors ?? {}
  return (
    <form
      id="rate"
      action={action}
      className="flex scroll-mt-24 flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div>
        <p id="rate-title" className="font-semibold">
          How was your order?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Rate it from 1 to 5 stars. It takes a few seconds.
        </p>
      </div>
      <div>
        <StarRatingInput
          name="rating"
          value={rating}
          onChange={setRating}
          labelledBy="rate-title"
        />
        {errors.rating ? (
          <p className="mt-1 text-sm text-danger-ink">{errors.rating}</p>
        ) : null}
      </div>
      <Field data-invalid={Boolean(errors.comment) || undefined}>
        <FieldLabel htmlFor="review-comment">
          Anything to add?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Textarea
          id="review-comment"
          name="comment"
          rows={3}
          maxLength={500}
          defaultValue={state.values?.comment}
        />
        {errors.comment ? (
          <FieldError>{errors.comment}</FieldError>
        ) : (
          <FieldDescription>
            We may show your rating, comment and first name on our website.
          </FieldDescription>
        )}
      </Field>
      {state.status === "error" && state.message ? (
        <Notice tone="danger" icon={false}>
          {state.message}
        </Notice>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-fit"
        disabled={pending || !rating}
      >
        {pending ? "Sending..." : "Send rating"}
      </Button>
    </form>
  )
}
