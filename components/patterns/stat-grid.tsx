import Link from "next/link"
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, MinusIcon } from "@phosphor-icons/react/ssr"
import type { Icon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

export type Stat = {
  label: string
  value: React.ReactNode
  /** One short line under the number: a split, a unit, or what to do. */
  sub?: React.ReactNode
  href?: string
  icon?: Icon
  /** Change against the previous period of the same length, from real data. */
  delta?: { now: number; before: number; period: string; better?: "up" | "down" }
  /** Real values per day (or per bucket) in the period, oldest first. */
  trend?: number[]
  /** Draws the eye when the number needs action (waiting orders, attention). */
  tone?: "default" | "warning"
}

/**
 * KPI tiles on a hairline grid: icon and label, a large figure, the change against the
 * previous period in words and arrow (never colour alone), and a quiet trend of the real
 * daily values. A tile with a link is one click target. Two columns on phones, up to five
 * across on desktop; an odd last tile spans both columns on phones.
 */
export function StatGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  const cols = stats.length >= 5 ? "lg:grid-cols-5" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border max-lg:[&>*:last-child:nth-child(odd)]:col-span-2", cols, className)}>
      {stats.map((s) => {
        const Glyph = s.icon
        const body = (
          <>
            <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {Glyph ? (
                <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Glyph className="size-4" />
                </span>
              ) : null}
              {s.label}
            </dt>
            <dd className={cn("mt-3 font-heading text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums sm:text-3xl", s.tone === "warning" && "text-warning-ink")}>
              {s.value}
            </dd>
            {s.delta ? <Delta {...s.delta} /> : null}
            {s.sub ? <dd className="mt-1.5 text-sm text-muted-foreground">{s.sub}</dd> : null}
            {s.trend && s.trend.some((v) => v > 0) ? <Trend values={s.trend} /> : null}
            {s.href ? (
              <dd className="mt-auto flex items-center gap-1 pt-3 text-sm font-medium text-muted-foreground transition-colors group-hover:text-brand">
                Open <ArrowRightIcon aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </dd>
            ) : null}
          </>
        )
        const cell = "flex flex-col bg-background p-4 sm:p-5"
        return s.href ? (
          <Link key={s.label} href={s.href} className={cn(cell, "group transition-colors hover:bg-card focus-visible:relative focus-visible:z-10")}>
            {body}
          </Link>
        ) : (
          <div key={s.label} className={cell}>
            {body}
          </div>
        )
      })}
    </dl>
  )
}

/** "+18% vs previous 30 days", with an arrow; good or bad by the metric's own direction. */
function Delta({ now, before, period, better = "up" }: NonNullable<Stat["delta"]>) {
  if (before === 0 && now === 0) {
    return <dd className="mt-2 text-sm text-muted-foreground">No change vs {period}</dd>
  }
  if (before === 0) {
    return <dd className="mt-2 text-sm text-muted-foreground">New vs {period}</dd>
  }
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct > 0
  const flat = pct === 0
  const good = flat ? null : up === (better === "up")
  const Arrow = flat ? MinusIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <dd className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", good === true && "text-success-ink", good === false && "text-danger-ink")}>
        <Arrow aria-hidden weight="bold" className="size-3.5" />
        {flat ? "0%" : `${up ? "+" : ""}${pct}%`}
      </span>
      <span>vs {period}</span>
    </dd>
  )
}

/** The real daily values as small bars; hidden from screen readers (the figure says it). */
function Trend({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <dd aria-hidden className="mt-3 flex h-8 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-t-[1px]", v > 0 ? "bg-brand/70" : "bg-border")}
          style={{ height: v > 0 ? `${Math.max(10, (v / max) * 100)}%` : "1px" }}
        />
      ))}
    </dd>
  )
}
