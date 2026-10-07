"use client"

import * as React from "react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import type { CarrierMixRow, PerDayRow, PriceLadderRow } from "@/lib/admin/stats"
import { cn } from "@/lib/utils"

/*
  Dataviz rules applied: one y-axis per chart, hairline solid grid, 2px lines, bars <= 24px
  with 4px rounded data ends, 2px surface gaps and rings, legend for 2+ series, selective
  direct labels, value-first tooltips with line keys, and a table view under every chart.
  Colours are --chart-1 (plum) and --chart-2 (copper), validated for light and dark.
*/

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 10 ? 2 : 0 }).format(n)
const usdExact = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
const dayLabel = (d: number) => (d === 1 ? "1 day" : `${d} days`)

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 }

const WIDE = "(min-width: 640px)"
function useWide() {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE)
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia(WIDE).matches,
    () => true
  )
}

/** On narrow screens keep the ends plus two or three evenly spread lengths, so ticks never collide. */
function sparseTicks(days: number[]) {
  if (days.length <= 4) return days
  const min = days[0]
  const max = days[days.length - 1]
  const keep = new Set([min, max])
  for (const target of [max / 4, max / 2]) {
    let best = days[0]
    for (const d of days) if (Math.abs(d - target) < Math.abs(best - target)) best = d
    if ((best - min) / (max - min) > 0.15 && (max - best) / (max - min) > 0.15) keep.add(best)
  }
  return days.filter((d) => keep.has(d))
}

/* ---------- shared chrome ------------------------------------------------------------ */

export function ChartCard({
  title,
  description,
  legend,
  children,
  table,
  className,
}: {
  title: string
  description: string
  legend?: React.ReactNode
  children: React.ReactNode
  table: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card p-4 sm:p-6", className)}>
      <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {legend ? <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{legend}</div> : null}
      <div className="mt-4">{children}</div>
      <details className="group mt-3 border-t pt-3 text-sm">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show data table</span>
          <span className="hidden group-open:inline">Hide data table</span>
        </summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </section>
  )
}

function LegendKey({ kind, color, children }: { kind: "rect" | "line" | "band"; color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={cn(kind === "line" ? "h-0.5 w-4 rounded-full" : "size-3 rounded-[3px]")}
        style={{ background: kind === "band" ? `color-mix(in oklch, ${color} 18%, transparent)` : color }}
      />
      {children}
    </span>
  )
}

type TipRow = { key: string; color: string; label: string; value: string }

/** Value leads, label follows, series keyed by a short line in the series colour. */
function Tip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="grid min-w-40 gap-2 rounded-lg bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-pop ring-1 ring-border">
      <p className="font-medium">{title}</p>
      <div className="grid gap-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="font-mono text-sm font-medium text-foreground tabular-nums">{r.value}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full min-w-72 text-left text-sm">
      <thead>
        <tr className="border-b text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} scope="col" className={cn("py-2 font-normal", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((r) => (
          <tr key={String(r[0])} className="border-b last:border-0">
            {r.map((cell, i) => (
              <td key={i} className={cn("py-2", i > 0 && "text-right font-mono")}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------- 1. Price by package length ----------------------------------------------- */

const ladderConfig = {
  median: { label: "Median price", color: "var(--chart-1)" },
  range: { label: "Lowest to highest", color: "var(--chart-1)" },
} satisfies ChartConfig

export function PriceLadderChart({ data }: { data: PriceLadderRow[] }) {
  const last = data[data.length - 1]
  const wide = useWide()
  const days = data.map((d) => d.days)
  return (
    <ChartCard
      title="Price by package length"
      className="lg:col-span-3"
      description="Median retail price for each length across live plans, with the lowest-to-highest spread."
      legend={
        <>
          <LegendKey kind="line" color="var(--chart-1)">Median price</LegendKey>
          <LegendKey kind="band" color="var(--chart-1)">Lowest to highest</LegendKey>
        </>
      }
      table={
        <DataTable
          head={["Length", "Lowest", "Median", "Highest", "Plans"]}
          rows={data.map((r) => [dayLabel(r.days), usdExact(r.min), usdExact(r.median), usdExact(r.max), r.plans])}
        />
      }
    >
      <ChartContainer config={ladderConfig} className="aspect-auto h-64 w-full">
        <ComposedChart data={data} margin={{ top: 16, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="days"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={wide ? days : sparseTicks(days)}
            tickFormatter={(d: number) => `${d}d`}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={axisTick}
            tickMargin={8}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => usd(v)}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={52}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as PriceLadderRow | undefined) : undefined
              if (!row) return null
              return (
                <Tip
                  title={`${dayLabel(row.days)} · ${row.plans} ${row.plans === 1 ? "plan" : "plans"}`}
                  rows={[
                    { key: "median", color: "var(--chart-1)", label: "median", value: usdExact(row.median) },
                    { key: "max", color: "color-mix(in oklch, var(--chart-1) 35%, transparent)", label: "highest", value: usdExact(row.max) },
                    { key: "min", color: "color-mix(in oklch, var(--chart-1) 35%, transparent)", label: "lowest", value: usdExact(row.min) },
                  ]}
                />
              )
            }}
          />
          <Area
            dataKey="range"
            type="monotone"
            stroke="none"
            fill="var(--chart-1)"
            fillOpacity={0.1}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="median"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          >
            {/* Selective label: the end value only. */}
            <LabelList
              dataKey="median"
              content={({ x, y, index }) =>
                index === data.length - 1 && last ? (
                  <text x={Number(x) + 10} y={Number(y) + 4} fill="var(--foreground)" fontSize={12} fontWeight={500}>
                    {usd(last.median)}
                  </text>
                ) : null
              }
            />
          </Line>
        </ComposedChart>
      </ChartContainer>
    </ChartCard>
  )
}

/* ---------- 2. Price per day ----------------------------------------------------------- */

const perDayConfig = { perDay: { label: "Median price per day", color: "var(--chart-1)" } } satisfies ChartConfig

export function PricePerDayChart({ data }: { data: PerDayRow[] }) {
  const lo = Math.min(...data.map((d) => d.perDay))
  const hi = Math.max(...data.map((d) => d.perDay))
  return (
    <ChartCard
      title="Median price per day"
      className="lg:col-span-2"
      description="What a day costs at each package length. Longer packages should cost less per day."
      table={<DataTable head={["Length", "Per day"]} rows={data.map((r) => [r.label, usdExact(r.perDay)])} />}
    >
      <ChartContainer config={perDayConfig} className="aspect-auto h-64 w-full">
        <BarChart data={data} margin={{ top: 24, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="days"
            tickFormatter={(d: number) => `${d}d`}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={axisTick}
            tickMargin={8}
            interval={0}
          />
          <YAxis tickFormatter={(v: number) => usd(v)} tickLine={false} axisLine={false} tick={axisTick} width={52} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as PerDayRow | undefined) : undefined
              if (!row) return null
              return <Tip title={row.label} rows={[{ key: "d", color: "var(--chart-1)", label: "per day", value: usdExact(row.perDay) }]} />
            }}
          />
          <Bar dataKey="perDay" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {/* Selective labels: the dearest and the cheapest day only. */}
            <LabelList
              dataKey="perDay"
              position="top"
              offset={6}
              content={({ x, y, width, value }) =>
                value === hi || value === lo ? (
                  <text
                    x={Number(x) + Number(width) / 2}
                    y={Number(y) - 6}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize={12}
                    fontWeight={500}
                  >
                    {usdExact(Number(value))}
                  </text>
                ) : null
              }
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

/* ---------- 3. Live plans by carrier ------------------------------------------------- */

const mixConfig = {
  esim: { label: "eSIM", color: "var(--chart-1)" },
  physical: { label: "SIM card", color: "var(--chart-2)" },
} satisfies ChartConfig

export function CarrierMixChart({ data }: { data: CarrierMixRow[] }) {
  const height = Math.max(160, data.length * 44 + 40)
  return (
    <ChartCard
      title="Live plans by carrier"
      className="lg:col-span-5"
      description="How many plans each carrier has on the website right now, by product."
      legend={
        <>
          <LegendKey kind="rect" color="var(--chart-1)">eSIM</LegendKey>
          <LegendKey kind="rect" color="var(--chart-2)">SIM card</LegendKey>
        </>
      }
      table={
        <DataTable head={["Carrier", "eSIM", "SIM card", "Total"]} rows={data.map((r) => [r.carrier, r.esim, r.physical, r.total])} />
      }
    >
      <ChartContainer config={mixConfig} className="aspect-auto w-full" style={{ height }}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis
            type="category"
            dataKey="carrier"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ ...axisTick, fill: "var(--foreground)" }}
            width={104}
          />
          <YAxis
            yAxisId="totals"
            type="category"
            orientation="right"
            dataKey="total"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 500 }}
            width={28}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as CarrierMixRow | undefined) : undefined
              if (!row) return null
              return (
                <Tip
                  title={`${row.carrier} · ${row.total} live`}
                  rows={[
                    { key: "e", color: "var(--chart-1)", label: "eSIM", value: String(row.esim) },
                    { key: "p", color: "var(--chart-2)", label: "SIM card", value: String(row.physical) },
                  ]}
                />
              )
            }}
          />
          {/* The surface-coloured stroke is the 2px gap between stacked segments. */}
          <Bar dataKey="esim" stackId="mix" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar
            dataKey="physical"
            stackId="mix"
            fill="var(--chart-2)"
            stroke="var(--card)"
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
