import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { Tag } from "@/components/patterns/tag"
import { ProductBadges } from "@/components/site/product-mark"
import { listPlans } from "@/lib/admin/queries"
import { formatDays, formatPrice } from "@/lib/format"
import { paidCents } from "@/lib/pricing"
import { RefillSwitch } from "../plans/refill-switch"

export const metadata: Metadata = { title: "Refills" }

export default function RefillsPage() {
  return (
    <>
      <AdminPageHeader
        title="Refills"
        description="Refills use the plan's own prices. Customers pay the customer price. Dealers pay the wholesale price, or their own special price set in Dealers."
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <RefillPlans />
      </Suspense>
    </>
  )
}

async function RefillPlans() {
  const plans = (await listPlans()).filter((p) => p.published)
  if (!plans.length) {
    return (
      <EmptyState icon={<ArrowsClockwiseIcon />} title="No published plans">
        Publish a plan under Plans first. Refills use its prices.
      </EmptyState>
    )
  }

  // Grouped by carrier, in the order the website shows them.
  const carriers: { name: string; order: number; plans: typeof plans }[] = []
  for (const p of plans) {
    let c = carriers.find((x) => x.name === p.carrier.name)
    if (!c) {
      c = { name: p.carrier.name, order: p.carrier.display_order, plans: [] }
      carriers.push(c)
    }
    c.plans.push(p)
  }
  carriers.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  const anyOn = plans.some((p) => p.refillable)

  return (
    <div className="flex flex-col gap-8">
      {anyOn ? null : (
        <EmptyState icon={<ArrowsClockwiseIcon />} title="No plans are offered for refills yet">
          Customers and dealers see &quot;Refills open soon&quot;. Switch a plan on below.
        </EmptyState>
      )}
      {carriers.map((c) => (
        <section key={c.name} aria-label={c.name}>
          <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{c.name}</h2>
          <ul className="flex flex-col gap-3">
            {c.plans.map((p) => {
              const lengths = p.packages.filter((k) => k.active).sort((a, b) => a.days - b.days)
              return (
                <li key={p.id} className="rounded-xl border bg-background">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <ProductBadges plan={p} />
                      {p.refillable ? <Tag tone="success">Refills on</Tag> : null}
                    </div>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <span className="text-muted-foreground">Offer for refills</span>
                      <RefillSwitch id={p.id} name={p.name} refillable={p.refillable} />
                    </label>
                  </div>
                  {lengths.length ? (
                    <div className="px-4 py-3 sm:px-5">
                      <div aria-hidden className="grid grid-cols-[1fr_auto_auto] gap-x-6 pb-1.5 text-xs text-muted-foreground">
                        <span>Length</span>
                        <span className="text-right">Customer price</span>
                        <span className="w-36 text-right">Dealer price</span>
                      </div>
                      <dl className="flex flex-col gap-1.5">
                        {lengths.map((k) => (
                          <div key={k.id} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 text-sm">
                            <dt>{formatDays(k.days)}</dt>
                            <dd className="text-right font-mono tabular">{formatPrice(paidCents(k))}</dd>
                            <dd className="w-36 text-right font-mono tabular">
                              {k.wholesale_price_cents === null ? (
                                <span className="font-sans text-muted-foreground">Not offered to dealers</span>
                              ) : (
                                formatPrice(k.wholesale_price_cents)
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">No day packages on sale.</p>
                  )}
                  <div className="border-t px-4 py-2 sm:px-5">
                    <Link
                      href={`/admin/plans/${p.id}`}
                      className="inline-flex min-h-10 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
                    >
                      Edit prices
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
