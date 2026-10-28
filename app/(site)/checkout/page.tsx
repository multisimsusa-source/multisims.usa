import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Container } from "@/components/site/section"
import { CarrierLogo } from "@/components/site/carrier-logo"
import { getCallingDestinations, getIntlCallingAddon, getPublishedPlans, getSimCardPrices, getSimCards } from "@/lib/catalog"
import { dataLabel, hotspotLabel } from "@/lib/format"
import { minimumOrderCents, paymentsEnabled } from "@/lib/payments"
import { createServiceClient } from "@/lib/supabase/service"
import { cn } from "@/lib/utils"
import { CheckoutForm } from "./checkout-form"

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
}

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <Container className="py-8 sm:py-12">
      <Suspense fallback={<CheckoutSkeleton />}>
        <Checkout searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}

async function Checkout({
  searchParams,
}: Pick<PageProps<"/checkout">, "searchParams">) {
  const params = await searchParams
  const slug = typeof params.plan === "string" ? params.plan : ""
  const cardSlug = typeof params.card === "string" ? params.card : ""
  const days = Number(params.days)

  const [plans, simCards, cardPrices, addon, fees, destinations] = await Promise.all([
    getPublishedPlans(),
    getSimCards(),
    getSimCardPrices(),
    getIntlCallingAddon(),
    getCheckoutFees(),
    getCallingDestinations(),
  ])
  const plan = slug ? (plans.find((p) => p.slug === slug) ?? null) : null
  const pkg = plan?.packages.find((p) => p.days === days)
  // SIM cards: the carrier's card, and its SIM card plans to pick from (or none).
  const carrierSlug = plan?.carrier.slug ?? cardSlug
  const physical = plan ? plan.product_type === "physical" : Boolean(cardSlug)
  const simCard = physical ? (simCards.find((c) => c.carrier.slug === carrierSlug) ?? null) : null
  const carrier = plan?.carrier ?? simCard?.carrier
  const choices = physical
    ? plans.filter((p) => p.product_type === "physical" && p.carrier.slug === carrierSlug)
    : plan
      ? [plan]
      : []

  if (!carrier || (plan ? !pkg : !simCard)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-2xl font-semibold">Choose a plan first</h2>
        <p className="mt-2 text-muted-foreground">
          {slug || cardSlug
            ? "This plan or day package is no longer available."
            : "Pick a plan and how many days you need, then come back here."}
        </p>
        <Link
          href="/plans"
          className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11")}
        >
          Browse plans
        </Link>
      </div>
    )
  }

  return (
    <>
      <Link
        href={plan ? `/plans/${plan.slug}` : "/plans?type=physical"}
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {plan ? `${plan.carrier.name} ${plan.name}` : "SIM cards"}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Checkout</h1>
      <p className="mt-2 text-muted-foreground">
        No account needed. Your order gets its own private page.
      </p>
      <div className="mt-8">
        <CheckoutForm
          productType={physical ? "physical" : "esim"}
          carrier={{ name: carrier.name, slug: carrier.slug }}
          logo={<CarrierLogo carrier={carrier} size="sm" />}
          choices={choices.map((p) => ({
            slug: p.slug,
            name: p.name,
            facts: [dataLabel(p), p.hotspot_gb ? hotspotLabel(p) : null].filter(Boolean).join(", "),
            packages: p.packages.map(({ days, price_cents, regular_price_cents }) => ({ days, price_cents, regular_price_cents })),
          }))}
          initialPlan={plan?.slug ?? null}
          initialDays={pkg?.days ?? null}
          cardOnSale={Boolean(simCard)}
          addon={addon}
          initialIntl={params.intl === "1"}
          callingList={destinations.length > 0}
          fees={{ ...fees, simCardCents: cardPrices[carrier.id] ?? fees.simCardCents }}
          takesPayment={paymentsEnabled()}
        />
      </div>
    </>
  )
}

/** Fees and the minimum order, read fresh on every checkout (the server checks again). */
async function getCheckoutFees() {
  const { data } = await createServiceClient()
    .from("settings")
    .select("shipping_fee_cents, sim_card_price_cents, network_fee_cents, min_order_cents")
    .maybeSingle()
  return {
    shippingCents: data?.shipping_fee_cents ?? 0,
    simCardCents: data?.sim_card_price_cents ?? 0,
    networkFeeCents: data?.network_fee_cents ?? 0,
    minimumCents: await minimumOrderCents(data?.min_order_cents ?? 0),
  }
}

function CheckoutSkeleton() {
  return (
    <>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-4 h-10 w-56" />
      <div className="mt-8" />
      <div
        aria-hidden
        className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:gap-10"
      >
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl max-lg:-order-1" />
      </div>
    </>
  )
}
