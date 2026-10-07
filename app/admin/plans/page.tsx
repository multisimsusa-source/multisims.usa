import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { PlusIcon, TagIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { CarrierLogo } from "@/components/site/carrier-logo"
import { ProductBadge } from "@/components/site/product-mark"
import { ListSkeleton } from "@/components/admin/skeletons"
import { Skeleton } from "@/components/ui/skeleton"
import { hiddenReason, listCarriers, listPlans } from "@/lib/admin/queries"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PlanFilters } from "./plan-filters"
import { PublishSwitch } from "./publish-switch"

export const metadata: Metadata = { title: "Plans" }

export default function AdminPlansPage({ searchParams }: PageProps<"/admin/plans">) {
  return (
    <>
      <AdminPageHeader
        title="Plans"
        description="A plan is live when it is published, its carrier is on the website, and at least one day package is on sale."
        actions={
          <Link href="/admin/plans/new" className={cn(buttonVariants({ size: "lg" }), "h-10")}>
            <PlusIcon weight="bold" data-icon="inline-start" />
            New plan
          </Link>
        }
      />
      <Suspense
        fallback={
          <div aria-hidden>
            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full sm:w-48" />
              <Skeleton className="h-10 w-full sm:w-44" />
            </div>
            <Skeleton className="mb-3 h-5 w-20" />
            <ListSkeleton rows={8} />
          </div>
        }
      >
        <PlanResults searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function PlanResults({ searchParams }: Pick<PageProps<"/admin/plans">, "searchParams">) {
  const params = await searchParams
  const carrierFilter = typeof params.carrier === "string" ? params.carrier : ""
  const typeFilter = params.type === "esim" || params.type === "physical" ? params.type : ""
  const query = typeof params.q === "string" ? params.q.trim() : ""

  const [plans, carriers] = await Promise.all([listPlans(), listCarriers()])
  const needle = query.toLowerCase()
  const filtered = plans.filter(
    (p) =>
      (!carrierFilter || p.carrier.id === carrierFilter) &&
      (!typeFilter || p.product_type === typeFilter) &&
      (!needle || `${p.name} ${p.slug} ${p.carrier.name}`.toLowerCase().includes(needle))
  )
  const filtering = Boolean(carrierFilter || typeFilter || query)

  return (
    <>
      <PlanFilters
        carriers={carriers.map((c) => ({ id: c.id, name: c.name }))}
        carrier={carrierFilter}
        type={typeFilter}
        query={query}
      />

      {filtered.length ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {filtering ? `${filtered.length} of ${plans.length} plans` : plural(plans.length, "plan", "plans")}
          </p>

          {/* Desktop: a table that scans by column. */}
          <div className="hidden overflow-hidden rounded-xl border bg-background md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Plan</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Carrier</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Product</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Packages</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">From</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Website</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Published</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((plan) => {
                  const reason = hiddenReason(plan)
                  const onSale = plan.packages.filter((p) => p.active)
                  const from = onSale.length ? Math.min(...onSale.map((p) => p.price_cents)) : null
                  return (
                    <tr key={plan.id} className="transition-colors hover:bg-muted/30">
                      <td className="max-w-64 px-4 py-3">
                        <Link href={`/admin/plans/${plan.id}`} className="block truncate font-medium hover:underline underline-offset-4">
                          {plan.name}
                        </Link>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{plan.slug}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex h-6 w-20 items-center">
                          <CarrierLogo carrier={plan.carrier} size="sm" />
                        </span>
                        <span className="sr-only">{plan.carrier.name}</span>
                      </td>
                      <td className="px-3 py-3">
                        <ProductBadge type={plan.product_type} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {onSale.length}
                        {onSale.length !== plan.packages.length ? (
                          <span className="text-muted-foreground"> / {plan.packages.length}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{from !== null ? formatPrice(from) : "-"}</td>
                      <td className="px-3 py-3">
                        <WebsiteStatus reason={reason} />
                      </td>
                      <td className="px-3 py-3">
                        <PublishSwitch id={plan.id} name={plan.name} published={plan.published} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/plans/${plan.id}`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per plan. */}
          <ul className="divide-y overflow-hidden rounded-xl border bg-background md:hidden">
            {filtered.map((plan) => {
              const reason = hiddenReason(plan)
              const onSale = plan.packages.filter((p) => p.active)
              const from = onSale.length ? Math.min(...onSale.map((p) => p.price_cents)) : null
              return (
                <li key={plan.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <CarrierLogo carrier={plan.carrier} size="sm" />
                    <ProductBadge type={plan.product_type} />
                  </div>
                  <Link href={`/admin/plans/${plan.id}`} className="mt-2.5 block font-medium hover:underline underline-offset-4">
                    {plan.name}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {plural(onSale.length, "package", "packages")} on sale
                    {from !== null ? (
                      <>
                        <span className="mx-1.5">/</span>
                        <span className="font-mono">from {formatPrice(from)}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <WebsiteStatus reason={reason} />
                    <span aria-hidden className="flex-1" />
                    <PublishSwitch id={plan.id} name={plan.name} published={plan.published} />
                    <Link href={`/admin/plans/${plan.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 px-4")}>
                      Edit
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <div className="rounded-xl border border-dashed bg-background p-10 text-center">
          <TagIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">{plans.length ? "No plans match" : "No plans yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {plans.length
              ? "Try another carrier, product or search."
              : carriers.length
                ? "Create a plan, add its day packages and publish it."
                : "Add a carrier first, then create plans under it."}
          </p>
          {plans.length ? (
            <Link href="/admin/plans" className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-brand hover:underline underline-offset-4">
              Clear filters
            </Link>
          ) : null}
        </div>
      )}
    </>
  )
}

/** "Live" in green, or why customers cannot see the plan, in amber. Dot plus words, never colour alone. */
function WebsiteStatus({ reason }: { reason: string | null }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", reason ? "text-warning-ink" : "text-success-ink")}>
      <span aria-hidden className={cn("size-1.5 rounded-full", reason ? "bg-warning-ink" : "bg-success-ink")} />
      {reason ?? "Live"}
    </span>
  )
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}
