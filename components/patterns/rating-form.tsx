"use client"

import * as React from "react"
import { CheckCircleIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import type { GivenReview } from "@/lib/review-rules"
import { cn } from "@/lib/utils"

type SaveRating = (prev: FormState, formData: FormData) => Promise<FormState>

/**
 * Stars and an optional comment for an order or one SIM. Shows the saved rating with
 * an Edit button once given; editing reopens the form with the saved values. Inline it
 * is a card; inside a dialog (`bare`) it drops the card and closes the dialog on save.
 */
export function RatingForm({
  action,
  given,
  title,
  description,
  consent,
  thanks = "Thanks for rating",
  bare,
  startEditing,
  onSaved,
}: {
  action: SaveRating
  given: GivenReview | null
  title: string
  description: string
  /** Who may see it, under the comment ("We may show your rating ..."). */
  consent: string
  /** The heading once rated. */
  thanks?: string
  bare?: boolean
  startEditing?: boolean
  onSaved?: (message: string) => void
}) {
  const [editing, setEditing] = React.useState(Boolean(startEditing))
  // What was last saved here, shown at once (the refreshed page brings the same).
  const [sent, setSent] = React.useState<GivenReview | null>(null)
  const shown = sent ?? given
  const [rating, setRating] = React.useState(shown?.rating ?? 0)
  const id = React.useId()
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData)
      if (result.status === "success") {
        setSent({
          rating: Number(formData.get("rating")),
          comment: String(formData.get("comment") ?? "").trim(),
          updated_at: shown ? new Date().toISOString() : null,
        })
        setEditing(false)
        onSaved?.(result.message ?? "Saved")
      }
      return result
    },
    { status: "idle" }
  )

  const frame = bare ? "" : "rounded-xl border bg-card p-5 sm:p-6"

  if (shown && !editing) {
    return (
      <div id={bare ? undefined : "rate"} className={cn("scroll-mt-24", frame)}>
        <div role="status">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-success-ink" />
            {thanks}
          </p>
        </div>
        {state.status === "success" && state.message ? (
          <p className="sr-only">{state.message}</p>
        ) : null}
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          You gave it <Stars rating={shown.rating} />
          {shown.updated_at ? <span>(changed)</span> : null}
        </p>
        {shown.comment ? (
          <p className="mt-3 max-w-[60ch] rounded-lg bg-muted px-4 py-3 text-sm whitespace-pre-line">
            {shown.comment}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-4"
          onClick={() => {
            setRating(shown.rating)
            setEditing(true)
          }}
        >
          <PencilSimpleIcon data-icon="inline-start" />
          Change rating
        </Button>
      </div>
    )
  }

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {}
  const comment =
    state.status === "error" ? state.values?.comment : shown?.comment
  return (
    <form
      id={bare ? undefined : "rate"}
      action={formAction}
      aria-labelledby={`${id}-title`}
      className={cn("flex scroll-mt-24 flex-col gap-5", frame)}
    >
      <div className={bare ? "sr-only" : undefined}>
        <p id={`${id}-title`} className="font-semibold">
          {title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>
        <StarRatingInput
          name="rating"
          value={rating}
          onChange={setRating}
          labelledBy={`${id}-title`}
        />
        {errors.rating ? (
          <p className="mt-1 text-sm text-danger-ink">{errors.rating}</p>
        ) : null}
      </div>
      <Field data-invalid={Boolean(errors.comment) || undefined}>
        <FieldLabel htmlFor={`${id}-comment`}>
          Anything to add?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Textarea
          id={`${id}-comment`}
          name="comment"
          rows={3}
          maxLength={500}
          defaultValue={comment}
        />
        {errors.comment ? (
          <FieldError>{errors.comment}</FieldError>
        ) : (
          <FieldDescription>{consent}</FieldDescription>
        )}
      </Field>
      {state.status === "error" && state.message ? (
        <Notice tone="danger" icon={false}>
          {state.message}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-fit"
          disabled={pending || !rating}
        >
          {pending ? "Sending..." : shown ? "Save changes" : "Send rating"}
        </Button>
        {shown && !bare ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full sm:w-fit"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/**
 * Rating one thing in a list (a SIM, a dealer line): a small button that opens the
 * RatingForm in a dialog. Unrated it reads "Rate"; rated it shows the stars to change them.
 */
export function RatingDialog({
  action,
  given,
  subject,
  description,
  consent,
  className,
}: {
  action: SaveRating
  given: GivenReview | null
  /** What is rated, in the button and the dialog title: "eSIM 2", "SIM card 1 replacement". */
  subject: string
  description: string
  consent: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  // A fresh form each time the dialog opens, so a cancelled edit leaves nothing behind.
  const [round, setRound] = React.useState(0)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setRound((r) => r + 1)
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={given ? "ghost" : "outline"}
            className={cn("min-h-10", className)}
            aria-label={given ? `Change your rating of ${subject}, ${given.rating} out of 5` : `Rate ${subject}`}
          />
        }
      >
        {given ? (
          <>
            <Stars rating={given.rating} />
            <PencilSimpleIcon data-icon="inline-end" />
          </>
        ) : (
          "Rate"
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {given ? `Change your rating of ${subject}` : `Rate ${subject}`}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <RatingForm
          key={round}
          action={action}
          given={given}
          title={`Rate ${subject}`}
          description={description}
          consent={consent}
          bare
          startEditing
          onSaved={(message) => {
            toast.success(message)
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
