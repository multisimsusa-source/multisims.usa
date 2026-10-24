import Link from "next/link"
import { ArrowRightIcon } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"

export type Stat = {
  label: string
  value: React.ReactNode
  /** One short line under the number: a split, a unit, or what to do. */
  sub?: React.ReactNode
  href?: string
  /** Draws the eye when the number needs action (waiting orders, attention). */
  tone?: "default" | "warning"
}

/**
 * Headline numbers on a hairline grid: label, mono figure, one line of context. A tile with
 * a link is one click target. Two columns on phones; up to five across on desktop.
 */
export function StatGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  const cols = stats.length >= 5 ? "lg:grid-cols-5" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
  return (
    // An odd last tile spans both columns on phones, so no empty cell shows.
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border max-lg:[&>*:last-child:nth-child(odd)]:col-span-2", cols, className)}>
      {stats.map((s) => {
        const body = (
          <>
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className={cn("mt-2 font-mono text-2xl font-medium tracking-tight tabular-nums", s.tone === "warning" && "text-warning-ink")}>{s.value}</dd>
            {s.sub ? <dd className="mt-1 text-xs text-muted-foreground">{s.sub}</dd> : null}
            {s.href ? (
              <dd className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                Open <ArrowRightIcon aria-hidden className="size-3.5" />
              </dd>
            ) : null}
          </>
        )
        return s.href ? (
          <Link key={s.label} href={s.href} className="group bg-background p-4 transition-colors hover:bg-card sm:p-5">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="bg-background p-4 sm:p-5">
            {body}
          </div>
        )
      })}
    </dl>
  )
}
