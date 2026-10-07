import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"

import { Skeleton } from "@/components/ui/skeleton"
import { PlanCard } from "@/components/site/plan-card"
import { PlansBrowser, type PlanSort } from "@/components/site/plans-browser"
import { Container, PageHeader } from "@/components/site/section"
import { getActiveCarriers, getPublishedPlans } from "@/lib/catalog"
import type { CatalogPlan, ProductType } from "@/lib/types"

export const metadata: Metadata = {
  title: "US SIM and eSIM Plans",
  description:
    "Compare US eSIM and SIM card plans from T-Mobile, Verizon, AT&T, Lycamobile and more. Choose 1 to 60 days with optional international calling.",
  alternates: { canonical: "/plans" },
}

export default function PlansPage({ searchParams }: PageProps<"/plans">) {
  return (
    <>
      <PageHeader
        title="US SIM and eSIM plans"
        description="Every plan comes in day packages. Pick a plan, then choose how many days you need on its page."
      />
      <Container className="py-8 sm:py-12">
        <Suspense fallback={<PlansFallback />}>
          <PlansResults searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  )
}

async function PlansResults({ searchParams }: Pick<PageProps<"/plans">, "searchParams">) {
  const params = await searchParams
  const type = parseType(params.type)
  const carrier = typeof params.carrier === "string" ? params.carrier : undefined
  const sort = parseSort(params.sort)

  const [allPlans, carriers] = await Promise.all([getPublishedPlans(), getActiveCarriers()])

  // Each menu's counts respect the other filter, so a number is what you would get.
  const byCarrier = allPlans.filter((p) => !carrier || p.carrier.slug === carrier)
  const byType = allPlans.filter((p) => !type || p.product_type === type)
  const plans = sortPlans(byCarrier.filter((p) => !type || p.product_type === type), sort)

  const carrierOptions = carriers
    .filter((c) => allPlans.some((p) => p.carrier.id === c.id))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      logo_path: c.logo_path,
      count: byType.filter((p) => p.carrier.id === c.id).length,
    }))

  return (
    <PlansBrowser
      type={type}
      carrier={carrier}
      sort={sort}
      total={plans.length}
      typeCounts={{
        all: byCarrier.length,
        esim: byCarrier.filter((p) => p.product_type === "esim").length,
        physical: byCarrier.filter((p) => p.product_type === "physical").length,
      }}
      carriers={carrierOptions}
    >
      {plans.length ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id} className="grid">
              <PlanCard plan={plan} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No plans match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another carrier or product type.</p>
          <Link
            href="/plans"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline underline-offset-4"
          >
            Show all plans
          </Link>
        </div>
      )}
    </PlansBrowser>
  )
}

function sortPlans(plans: CatalogPlan[], sort: PlanSort) {
  const list = [...plans]
  if (sort === "price-asc") list.sort((a, b) => a.from_price_cents - b.from_price_cents)
  if (sort === "price-desc") list.sort((a, b) => b.from_price_cents - a.from_price_cents)
  // Unlimited first, then the largest allowance.
  if (sort === "data") list.sort((a, b) => (b.data_gb ?? Infinity) - (a.data_gb ?? Infinity))
  return list
}

function PlansFallback() {
  return (
    <div aria-hidden>
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-10 w-24" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="h-11 sm:w-44" />
          <Skeleton className="h-11 sm:w-44" />
          <Skeleton className="col-span-2 h-11 sm:w-44" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function parseSort(value: string | string[] | undefined): PlanSort {
  return value === "price-asc" || value === "price-desc" || value === "data" ? value : "recommended"
}

function parseType(value: string | string[] | undefined): ProductType | undefined {
  return value === "esim" || value === "physical" ? value : undefined
}
