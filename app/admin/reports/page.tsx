import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { ChartBarIcon, DownloadSimpleIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader } from "@/components/admin/page-header"
import { SalesByDayChart } from "@/components/admin/dashboard-charts"
import { OverviewSkeleton } from "@/components/admin/skeletons"
import { DateRangeFilter } from "@/components/patterns/date-range-filter"
import { EmptyState } from "@/components/patterns/empty-state"
import { StatGrid } from "@/components/patterns/stat-grid"
import { UrlFilters } from "@/components/staff/url-filters"
import { readFilters, reportTables, type ReportTable } from "@/lib/admin/report-tables"
import { loadReport, resolveRange, salesByDay, salesTotals } from "@/lib/admin/reports"
import { formatPrice } from "@/lib/format"
import { listDealerNames, listStaff } from "@/lib/staff/queries"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Reports" }

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <>
      <AdminPageHeader
        title="Reports"
        description="Sales, deliveries, tickets and replacements for any dates, by carrier, dealer, agent or channel. Every table downloads as CSV."
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Report({ searchParams }: Pick<PageProps<"/admin/reports">, "searchParams">) {
  // The date range is worked out from today: render at request time.
  await connection()
  const raw = await searchParams
  const params = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const range = resolveRange(params)
  const filters = readFilters(params)
  const supabase = await createClient()
  const [data, carriers, dealers, staff] = await Promise.all([
    loadReport(range, filters),
    supabase.from("carriers").select("id, name").order("display_order").order("name"),
    listDealerNames(),
    listStaff(),
  ])
  const sales = salesTotals(data)
  const tables = reportTables(data)
  const exportHref = (key: ReportTable["key"]) => `/admin/reports/export?${new URLSearchParams({ ...params, report: key })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <DateRangeFilter params={params} from={range.from} to={range.to} />
        <UrlFilters
          query=""
          placeholder="Search"
          hideSearch
          params={params}
          selects={[
            { param: "carrier", label: "Carrier", value: filters.carrier ?? "all", items: [{ value: "all", label: "Any carrier" }, ...(carriers.data ?? []).map((c) => ({ value: c.id, label: c.name }))] },
            {
              param: "channel",
              label: "Channel",
              value: filters.channel ?? "all",
              items: [
                { value: "all", label: "Website and dealers" },
                { value: "website", label: "Website" },
                { value: "dealer", label: "Dealers" },
              ],
            },
            { param: "dealer", label: "Dealer", value: filters.dealer ?? "all", items: [{ value: "all", label: "Any dealer" }, ...dealers.map((d) => ({ value: d.profile_id, label: d.company }))] },
            { param: "agent", label: "Agent", value: filters.agent ?? "all", items: [{ value: "all", label: "Any agent" }, ...staff.map((s) => ({ value: s.id, label: s.full_name || s.email }))] },
          ]}
        />
        <p className="text-sm text-muted-foreground tabular">
          {range.from === range.to ? range.from : `${range.from} to ${range.to}`}, US Eastern days.
          {filters.agent ? " The agent filter applies to orders they filled; tickets are not counted per agent." : ""}
        </p>
      </div>

      <StatGrid
        stats={[
          { label: "Sales", value: formatPrice(sales.total), sub: `Website ${formatPrice(sales.website)}, dealers ${formatPrice(sales.dealer)}` },
          { label: "Orders paid", value: sales.orders },
          { label: "SIMs delivered", value: data.items.length },
          { label: "Tickets", value: data.tickets.length },
          { label: "Replacements", value: data.replacements.length },
        ]}
      />

      <SalesByDayChart data={salesByDay(data)} />

      {tables.map((t) => (
        <section key={t.key} id={t.key} aria-labelledby={`${t.key}-title`} className="scroll-mt-20">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id={`${t.key}-title`} className="type-section-title">
              {t.title}
            </h2>
            {t.rows.length ? (
              <a href={exportHref(t.key)} download className={buttonVariants({ variant: "outline" })}>
                <DownloadSimpleIcon data-icon="inline-start" />
                CSV
              </a>
            ) : null}
          </div>
          {t.rows.length ? (
            <div className="overflow-hidden rounded-xl border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    {t.head.map((h, i) => (
                      <TableHead key={h} className={cn("whitespace-nowrap", i > 0 && "text-right")}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.rows.map((r) => (
                    <TableRow key={String(r[0])}>
                      {r.map((cell, i) => (
                        <TableCell key={i} className={cn(i > 0 && "text-right font-mono tabular", i === 0 && "font-medium")}>
                          {t.money.includes(i) ? formatPrice(Math.round(Number(cell) * 100)) : cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                {t.total && t.rows.length > 1 ? (
                  <TableFooter>
                    <TableRow>
                      {t.total.map((cell, i) => (
                        <TableCell key={i} className={cn("font-semibold", i > 0 && "text-right font-mono tabular")}>
                          {t.money.includes(i) ? formatPrice(Math.round(Number(cell) * 100)) : cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
          ) : (
            <EmptyState icon={<ChartBarIcon />}>Nothing in this range{Object.values(filters).some(Boolean) ? " with these filters" : ""}.</EmptyState>
          )}
        </section>
      ))}
    </div>
  )
}
