import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { ArrowRightIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DeliveredByCarrierChart, SalesByDayChart } from "@/components/admin/dashboard-charts"
import { OverviewSkeleton } from "@/components/admin/skeletons"
import { DateRangeFilter } from "@/components/patterns/date-range-filter"
import { Panel } from "@/components/patterns/panel"
import { StatGrid } from "@/components/patterns/stat-grid"
import { hiddenReason, listCarriers, listPlans } from "@/lib/admin/queries"
import { byAgent, byCarrier, byDealer, loadReport, resolveRange, salesByDay, salesTotals, waitingNow } from "@/lib/admin/reports"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Overview" }

export default function AdminHome({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <AdminPageHeader
        title="Overview"
        description="Sales, orders waiting, and what agents and dealers did. Catalogue changes show on the website straight away."
        actions={
          <Link href="/admin/reports" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
            Reports
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        }
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Dashboard({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  // The date range is worked out from today: render at request time.
  await connection()
  const raw = await searchParams
  const params = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const range = resolveRange(params)
  const [data, carriers, plans] = await Promise.all([loadReport(range), listCarriers(), listPlans()])

  const sales = salesTotals(data)
  const waiting = waitingNow(data)
  const agents = byAgent(data)
  const dealers = byDealer(data).filter((d) => d.orders || d.fundedCents || d.takenCents)
  const funded = data.ledger.filter((l) => l.kind !== "capture").reduce((n, l) => n + l.amount_cents, 0)

  // Catalogue problems: published plans the website hides, carriers with nothing live.
  const live = plans.filter((p) => !hiddenReason(p))
  const attention = [
    ...(waiting.attention
      ? [{ key: "orders", href: "/admin/orders?status=needs_attention", title: `${waiting.attention} ${waiting.attention === 1 ? "order needs" : "orders need"} you`, detail: "Flagged by an agent", tag: "Needs attention" }]
      : []),
    ...plans
      .filter((p) => p.published && hiddenReason(p))
      .map((p) => ({ key: p.id, href: `/admin/plans/${p.id}`, title: p.name, detail: `${p.carrier.name} plan, published but not visible`, tag: hiddenReason(p) ?? "" })),
    ...carriers
      .filter((c) => c.active && !live.some((p) => p.carrier.id === c.id))
      .map((c) => ({ key: c.id, href: `/admin/plans?carrier=${c.id}`, title: c.name, detail: "Shown in the logo strip, but has no live plans", tag: "No live plans" })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangeFilter params={params} from={range.from} to={range.to} />
        <p className="text-sm text-muted-foreground tabular">
          {range.from === range.to ? range.from : `${range.from} to ${range.to}`}, US Eastern
        </p>
      </div>

      <StatGrid
        stats={[
          { label: "Sales", value: formatPrice(sales.total), sub: `Website ${formatPrice(sales.website)}, dealers ${formatPrice(sales.dealer)}` },
          { label: "Orders paid", value: sales.orders, href: "/admin/orders" },
          { label: "SIMs delivered", value: data.items.length, sub: "eSIMs delivered, SIM cards posted", href: "/admin/activations" },
          {
            label: "Waiting now",
            value: waiting.queued,
            sub: `${waiting.queuedSims} ${waiting.queuedSims === 1 ? "SIM" : "SIMs"} in the queue`,
            href: "/agent",
            tone: waiting.queued ? "warning" : "default",
          },
          { label: "Dealer funds in", value: formatPrice(funded), sub: "Top-ups and funds you added", href: "/admin/dealers" },
        ]}
      />

      <section aria-labelledby="attention">
        {attention.length ? (
          <div className="overflow-hidden rounded-xl border border-warning-ink/25 bg-background">
            <div className="flex items-center gap-2 border-b bg-warning-soft/60 px-4 py-3 sm:px-5">
              <WarningCircleIcon weight="fill" aria-hidden className="size-4 text-warning-ink" />
              <h2 id="attention" className="font-sans text-sm font-semibold tracking-normal">
                Needs attention
              </h2>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{attention.length}</span>
            </div>
            <ul className="divide-y">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">{a.detail}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-warning-soft px-2.5 py-1 text-xs text-warning-ink">{a.tag}</span>
                    <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm sm:px-5">
            <CheckCircleIcon weight="fill" aria-hidden className="size-4 text-success-ink" />
            <span id="attention">Nothing needs attention. No flagged orders, and every published plan is on the website.</span>
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <SalesByDayChart data={salesByDay(data)} className="lg:col-span-3" />
        <DeliveredByCarrierChart data={byCarrier(data)} className="lg:col-span-2" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Agent activity" action={<Link href={`/admin/reports?${new URLSearchParams(params)}#agents`} className="text-sm text-brand hover:underline">Report</Link>}>
          {agents.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-normal">Agent</th>
                  <th scope="col" className="pb-2 text-right font-normal">SIMs filled</th>
                  <th scope="col" className="pb-2 text-right font-normal">Holding now</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">{a.name}</td>
                    <td className="py-2 text-right font-mono tabular">{a.filled}</td>
                    <td className="py-2 text-right font-mono tabular">{a.holding}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No agents yet.</p>
          )}
        </Panel>
        <Panel title="Dealer activity" action={<Link href={`/admin/reports?${new URLSearchParams(params)}#dealers`} className="text-sm text-brand hover:underline">Report</Link>}>
          {dealers.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-normal">Dealer</th>
                  <th scope="col" className="pb-2 text-right font-normal">SIMs ordered</th>
                  <th scope="col" className="pb-2 text-right font-normal">Taken</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dealers.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2">
                      <Link href={`/admin/dealers/${d.id}`} className="hover:underline">
                        {d.company}
                      </Link>
                    </td>
                    <td className="py-2 text-right font-mono tabular">{d.sims}</td>
                    <td className="py-2 text-right font-mono tabular">{formatPrice(d.takenCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No dealer orders or funds in this range.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
