import { CalendarCheckIcon, CalendarPlusIcon, CalendarXIcon } from "@phosphor-icons/react/ssr"

import { daysBetween, formatPlanDate, usToday, type LineTimer } from "@/lib/plan-dates"
import { cn } from "@/lib/utils"

/**
 * How long a line has: "Active until 12 Nov 2026, 9 days left", then "Next plan starts
 * 13 Nov 2026, until 12 Dec 2026" when a refill is already bought, or "Plan ended 3 Oct 2026". Words first; the
 * icon only supports them.
 */
export function PlanTimer({ timer, className, today = usToday() }: { timer: LineTimer; className?: string; today?: string }) {
  const { current, next, ended } = timer
  const left = current ? daysBetween(today, current.ends_on) + 1 : 0
  return (
    <div className={cn("flex flex-col gap-1 text-sm", className)}>
      {current ? (
        <p className="flex items-start gap-2">
          <CalendarCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success-ink" />
          <span>
            Active until <span className="font-medium">{formatPlanDate(current.ends_on)}</span>,{" "}
            <span className="tabular">{left === 1 ? "last day today" : `${left} days left`}</span>
          </span>
        </p>
      ) : null}
      {next ? (
        <p className="flex items-start gap-2">
          <CalendarPlusIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            {current ? "Next plan starts" : "Plan starts"} <span className="font-medium">{formatPlanDate(next.starts_on)}</span>, until{" "}
            <span className="font-medium">{formatPlanDate(next.ends_on)}</span>
          </span>
        </p>
      ) : null}
      {ended ? (
        <p className="flex items-start gap-2 text-muted-foreground">
          <CalendarXIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>Plan ended {formatPlanDate(ended.ends_on)}</span>
        </p>
      ) : null}
    </div>
  )
}

/** One SIM's last plan day, for lists: "12 Nov 2026" with "9 days left" or "ended" below. */
export function PlanEnds({ endsOn, className, today = usToday() }: { endsOn: string | null; className?: string; today?: string }) {
  if (!endsOn) return <span className={cn("text-sm text-muted-foreground", className)}>Not dated</span>
  const left = daysBetween(today, endsOn) + 1
  return (
    <span className={cn("flex flex-col text-sm", className)}>
      <span className="tabular whitespace-nowrap">{formatPlanDate(endsOn)}</span>
      <span className={cn("text-xs", left > 0 ? "text-success-ink" : "text-muted-foreground")}>
        {left > 1 ? `${left} days left` : left === 1 ? "last day" : "ended"}
      </span>
    </span>
  )
}
