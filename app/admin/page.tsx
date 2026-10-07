import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckCircleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { AdminPageHeader } from "@/components/admin/page-header"
import { OverviewSkeleton } from "@/components/admin/skeletons"
import { hiddenReason, listAddons, listCarriers, listPlans } from "@/lib/admin/queries"
import { formatPrice } from "@/lib/format"
import { carrierMix, priceLadder, pricePerDay } from "@/lib/admin/stats"
import { CarrierMixChart, PriceLadderChart, PricePerDayChart } from "@/components/admin/catalog-charts"

export const metadata: Metadata = { title: "Overview" }

export default function AdminHome() {
  return (
    <>
      <AdminPageHeader
        title="Overview"
        description="Everything you change here shows on the website straight away."
        actions={
          <Link href="/admin/plans/new" className={cn(buttonVariants({ size: "lg" }), "h-10")}>
            <PlusIcon weight="bold" data-icon="inline-start" />
            New plan
          </Link>
        }
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </>
  )
}

async function OverviewContent() {
  const [carriers, plans, addons] = await Promise.all([
    listCarriers(),
    listPlans(),
    listAddons(),
  ])
  const live = plans.filter((p) => !hiddenReason(p))
  const hiddenPublished = plans.filter((p) => p.published && hiddenReason(p))
  const emptyCarriers = carriers.filter((c) => c.active && !live.some((p) => p.carrier.id === c.id))
  const attention = [
    ...hiddenPublished.map((p) => ({
      key: p.id,
      href: `/admin/plans/${p.id}`,
      title: p.name,
      detail: `${p.carrier.name} plan, published but not visible`,
      tag: hiddenReason(p) ?? "",
    })),
    ...emptyCarriers.map((c) => ({
      key: c.id,
      href: `/admin/plans?carrier=${c.id}`,
      title: c.name,
      detail: "Shown in the logo strip, but has no live plans",
      tag: "No live plans",
    })),
  ]
  const packagesOnSale = live.reduce((n, p) => n + p.packages.filter((x) => x.active).length, 0)
  const intl = addons.find((a) => a.code === "intl_calling")
  const mix = carrierMix(carriers, plans)
  const ladder = priceLadder(plans)
  const perDay = pricePerDay(ladder)

  const stats = [
    { label: "Carriers shown", value: carriers.filter((c) => c.active).length, of: carriers.length, href: "/admin/carriers" },
    { label: "Plans live", value: live.length, of: plans.length, href: "/admin/plans" },
    { label: "Packages on sale", value: packagesOnSale, href: "/admin/plans" },
    {
      label: "International calling",
      value: intl ? (intl.active ? formatPrice(intl.price_cents) : "Off") : "Missing",
      href: "/admin/addons",
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group bg-background p-4 transition-colors hover:bg-card sm:p-6">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight tabular-nums sm:text-3xl">
              {s.value}
              {"of" in s ? <span className="text-base text-muted-foreground"> / {s.of}</span> : null}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
              Manage <ArrowRightIcon className="size-3.5" />
            </span>
          </Link>
        ))}
      </div>

      <section aria-labelledby="attention" className="mt-6">
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
            <span id="attention">Nothing needs attention. Every published plan is visible on the website.</span>
          </p>
        )}
      </section>

      {ladder.length ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-5">
          <PriceLadderChart data={ladder} />
          <PricePerDayChart data={perDay} />
          <CarrierMixChart data={mix} />
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
          Charts appear once at least one plan is live with day packages.
        </div>
      )}

      <section className="mt-8 rounded-xl border border-dashed p-5 text-sm text-muted-foreground sm:p-6">
        <p className="font-medium text-foreground">Coming next</p>
        <p className="mt-1">Orders, the agent queue, customer messages and tickets arrive with checkout in the next milestone.</p>
      </section>
    </>
  )
}
