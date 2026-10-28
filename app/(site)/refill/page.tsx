import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/patterns/empty-state"
import { Container } from "@/components/site/section"
import { getCallingDestinations, getIntlCallingAddon, getPublishedPlans } from "@/lib/catalog"
import { getCustomerOrder } from "@/lib/customer-order"
import { dataLabel, hotspotLabel } from "@/lib/format"
import { minimumOrderCents, paymentsEnabled } from "@/lib/payments"
import { createServiceClient } from "@/lib/supabase/service"
import { RefillForm, type RefillCarrier, type RefillPrefill } from "./refill-form"

export const metadata: Metadata = {
  title: "Refill a US number",
  description: "Add plan days to a US number you already have, or activate a SIM card. Same SIM, same number.",
  alternates: { canonical: "/refill" },
}

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default function RefillPage({ searchParams }: Params) {
  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-3xl font-semibold sm:text-4xl">Refill</h1>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">
        Add days to a US number you already have and keep the same SIM and number, or activate a SIM card you
        bought without a plan. No account needed.
      </p>
      <Suspense fallback={<RefillSkeleton />}>
        <Refill searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}

async function Refill({ searchParams }: Params) {
  const params = await searchParams
  const [plans, addon, destinations, fees] = await Promise.all([
    getPublishedPlans(),
    getIntlCallingAddon(),
    getCallingDestinations(),
    getFees(),
  ])

  const carriers: RefillCarrier[] = []
  for (const p of plans.filter((p) => p.refillable)) {
    let c = carriers.find((x) => x.slug === p.carrier.slug)
    if (!c) {
      c = { slug: p.carrier.slug, name: p.carrier.name, plans: [] }
      carriers.push(c)
    }
    c.plans.push({
      slug: p.slug,
      name: p.name,
      sim: p.product_type === "physical",
      facts: [dataLabel(p), p.hotspot_gb ? hotspotLabel(p) : null].filter(Boolean).join(", "),
      packages: p.packages.map(({ days, price_cents, regular_price_cents }) => ({ days, price_cents, regular_price_cents })),
    })
  }

  if (!carriers.length) {
    return (
      <EmptyState
        className="mt-8"
        icon={<ArrowsClockwiseIcon />}
        title="Refills open soon"
        action={
          <Link href="/contact" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Contact us
          </Link>
        }
      >
        Message us with your number and we will help you add days.
      </EmptyState>
    )
  }

  // "Refill this number" and "Activate this SIM" from an order page: the buyer already
  // holds that page's private link, so its details can fill the form.
  const mode = params.mode === "activate" ? "activate" : "refill"
  let prefill: RefillPrefill = { mode }
  const token = typeof params.from === "string" ? params.from : ""
  const itemId = typeof params.item === "string" ? params.item : ""
  if (token && itemId) {
    const data = await getCustomerOrder(token)
    const item = data?.items.find((i) => i.id === itemId)
    if (data && item) {
      const carrier = carriers.find((c) => c.name === data.order.carrier_name)?.slug
      prefill = {
        mode,
        carrier,
        line_phone: item.phone_number ?? undefined,
        iccid: item.iccid ?? undefined,
        name: data.order.customer_name,
        email: data.order.customer_email,
        phone: data.order.customer_phone,
        zip: data.order.zip_code ?? undefined,
      }
    }
  }

  return (
    <div className="mt-8">
      <RefillForm
        carriers={carriers}
        prefill={prefill}
        addon={addon}
        callingList={destinations.length > 0}
        fees={fees}
        takesPayment={paymentsEnabled()}
      />
    </div>
  )
}

async function getFees() {
  const { data } = await createServiceClient().from("settings").select("network_fee_cents, min_order_cents").maybeSingle()
  return {
    networkFeeCents: data?.network_fee_cents ?? 0,
    minimumCents: await minimumOrderCents(data?.min_order_cents ?? 0),
  }
}

function RefillSkeleton() {
  return (
    <div aria-hidden className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem] lg:gap-10">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-80 rounded-xl max-lg:-order-1" />
    </div>
  )
}
