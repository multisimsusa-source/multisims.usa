"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { saveRefillDates } from "@/app/agent/actions"
import { daysBetween, formatPlanDate, usToday } from "@/lib/plan-dates"

/**
 * A refill's dates on the fulfilment screen: what we know of the number's current plan,
 * and the start and end the refill gives, proposed and editable. A number that was not
 * ours has no known end: the agent checks it in the carrier portal.
 */
export function RefillDates({
  itemId,
  currentEndsOn,
  startsOn,
  endsOn,
  saved,
  days,
  editable,
}: {
  itemId: string
  currentEndsOn: string | null
  startsOn: string
  endsOn: string
  /** The agent already saved these dates. */
  saved: boolean
  days: number
  editable: boolean
}) {
  const [start, setStart] = React.useState(startsOn)
  const [end, setEnd] = React.useState(endsOn)
  const [pending, run] = React.useTransition()
  const id = React.useId()
  const dirty = start !== startsOn || end !== endsOn
  const length = start && end ? daysBetween(start, end) + 1 : 0
  const today = usToday()
  // A plan that is already over is never right; an early or overlapping start may be, but say so.
  const endsPast = Boolean(end) && end < today
  const warning = endsPast
    ? "The end date is in the past. Choose dates from today on."
    : start && start < today
      ? "The start date is in the past."
      : start && currentEndsOn && start <= currentEndsOn
        ? `This starts before the current plan ends on ${formatPlanDate(currentEndsOn)}, so the days overlap.`
        : null

  return (
    <div className="rounded-xl border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-1 text-sm">
        <p>
          <span className="text-muted-foreground">Current plan ends: </span>
          {currentEndsOn ? (
            <span className="font-medium">{formatPlanDate(currentEndsOn)}</span>
          ) : (
            <span className="font-medium">Unknown, the number is not in our records. Check it in the carrier portal.</span>
          )}
        </p>
        <p className="text-muted-foreground">
          {saved ? "Dates saved for this refill." : "Proposed: the day after the current plan ends if it is still running, otherwise the day you complete it."}
        </p>
      </div>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            const result = await saveRefillDates(itemId, start, end)
            if (result.ok) toast.success(result.message ?? "Saved")
            else toast.error(result.error)
          })
        }}
      >
        <Field>
          <FieldLabel htmlFor={`${id}-start`}>Plan starts</FieldLabel>
          <Input
            id={`${id}-start`}
            type="date"
            value={start}
            disabled={!editable}
            onChange={(e) => setStart(e.currentTarget.value)}
            className="tabular font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-end`}>Plan ends</FieldLabel>
          <Input
            id={`${id}-end`}
            type="date"
            value={end}
            min={start}
            disabled={!editable}
            onChange={(e) => setEnd(e.currentTarget.value)}
            className="tabular font-mono"
          />
        </Field>
        {editable ? (
          <Button type="submit" size="lg" variant={dirty ? "default" : "outline"} disabled={pending || !dirty || !start || !end || end < start || endsPast}>
            {pending ? "Saving..." : "Save dates"}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground sm:col-span-full">
          {length > 0 ? `${length} ${length === 1 ? "day" : "days"}` : "Choose both dates"}
          {length > 0 && length !== days ? `, the plan is ${days} ${days === 1 ? "day" : "days"}` : ""}
        </p>
        {editable && warning ? <p className="text-sm text-danger-ink sm:col-span-full">{warning}</p> : null}
      </form>
    </div>
  )
}
