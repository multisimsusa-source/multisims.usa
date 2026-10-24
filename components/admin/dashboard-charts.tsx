"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { axisTick, ChartCard, DataTable, LegendKey, Tip } from "@/components/admin/catalog-charts"

/*
  Same rules as the catalogue charts: one y-axis, hairline grid, bars at most 24px with 4px
  rounded data ends and a 2px surface gap between stacked segments, legend for two series,
  value-first tooltips, a data table under every chart. --chart-1 plum, --chart-2 copper.
*/

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const usdExact = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
const shortDay = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))

const salesConfig = {
  website: { label: "Website", color: "var(--chart-1)" },
  dealer: { label: "Dealers", color: "var(--chart-2)" },
} satisfies ChartConfig

export type SalesDay = { day: string; website: number; dealer: number }

export function SalesByDayChart({ data, className }: { data: SalesDay[]; className?: string }) {
  const total = data.reduce((n, d) => n + d.website + d.dealer, 0)
  return (
    <ChartCard
      title="Sales per day"
      className={className}
      description={total ? "Orders paid each day, website and dealers. US Eastern days." : "No sales in this range."}
      legend={
        <>
          <LegendKey kind="rect" color="var(--chart-1)">Website</LegendKey>
          <LegendKey kind="rect" color="var(--chart-2)">Dealers</LegendKey>
        </>
      }
      table={
        <DataTable
          head={["Day", "Website", "Dealers", "Total"]}
          rows={data.filter((d) => d.website + d.dealer > 0).map((d) => [shortDay(d.day), usdExact(d.website), usdExact(d.dealer), usdExact(d.website + d.dealer)])}
        />
      }
    >
      <ChartContainer config={salesConfig} className="aspect-auto h-64 w-full">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={axisTick} tickFormatter={shortDay} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={usd} width={56} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as SalesDay | undefined) : undefined
              if (!row) return null
              return (
                <Tip
                  title={`${shortDay(row.day)} · ${usdExact(row.website + row.dealer)}`}
                  rows={[
                    { key: "w", color: "var(--chart-1)", label: "Website", value: usdExact(row.website) },
                    { key: "d", color: "var(--chart-2)", label: "Dealers", value: usdExact(row.dealer) },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="website" stackId="s" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="dealer" stackId="s" fill="var(--chart-2)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

const deliveredConfig = { delivered: { label: "SIMs delivered", color: "var(--chart-1)" } } satisfies ChartConfig

export function DeliveredByCarrierChart({ data, className }: { data: { carrier: string; delivered: number }[]; className?: string }) {
  const rows = data.filter((d) => d.delivered > 0)
  const height = Math.max(160, rows.length * 44 + 40)
  return (
    <ChartCard
      title="SIMs delivered by carrier"
      className={className}
      description={rows.length ? "eSIMs delivered and SIM cards posted in this range." : "Nothing delivered in this range."}
      table={<DataTable head={["Carrier", "SIMs"]} rows={rows.map((r) => [r.carrier, r.delivered])} />}
    >
      {rows.length ? (
        <ChartContainer config={deliveredConfig} className="aspect-auto w-full" style={{ height }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis type="category" dataKey="carrier" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ ...axisTick, fill: "var(--foreground)" }} width={104} />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as { carrier: string; delivered: number } | undefined) : undefined
                if (!row) return null
                return <Tip title={row.carrier} rows={[{ key: "d", color: "var(--chart-1)", label: "SIMs delivered", value: String(row.delivered) }]} />
              }}
            />
            <Bar dataKey="delivered" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No SIMs delivered yet.</div>
      )}
    </ChartCard>
  )
}
