import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  ChatTextIcon,
  GaugeIcon,
  GlobeHemisphereWestIcon,
  PhoneIcon,
  ShareNetworkIcon,
  WifiHighIcon,
} from "@phosphor-icons/react/ssr"

import { Skeleton } from "@/components/ui/skeleton"
import { CarrierLogo } from "@/components/site/carrier-logo"
import { JsonLd } from "@/components/json-ld"
import { PlanConfigurator } from "@/components/site/plan-configurator"
import { ProductBadge } from "@/components/site/product-mark"
import { Container } from "@/components/site/section"
import { getCallingDestinations, getIntlCallingAddon, getPlanBySlug, getPublishedPlans } from "@/lib/catalog"
import { dataLabel, hotspotLabel, productTypeLabel, slowdownLabel } from "@/lib/format"
import { absoluteUrl } from "@/lib/site"
import type { CatalogPlan } from "@/lib/types"

export async function generateStaticParams() {
  const plans = await getPublishedPlans()
  return plans.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps<"/plans/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const plan = await getPlanBySlug(slug)
  if (!plan) return { title: "Plan not found", robots: { index: false } }

  const title = `${plan.carrier.name} ${plan.name} ${productTypeLabel[plan.product_type]}`
  const description = `${plan.carrier.name} ${productTypeLabel[plan.product_type]} for the US: ${lowerFirst(dataLabel(plan))}, ${lowerFirst(hotspotLabel(plan))}, ${lowerFirst(plan.talk)}. ${plan.packages.length} day packages from ${plan.packages[0].days} to ${plan.packages[plan.packages.length - 1].days} days.`
  return {
    title,
    description,
    alternates: { canonical: `/plans/${plan.slug}` },
    openGraph: { title, description, url: `/plans/${plan.slug}`, type: "website" },
  }
}

export default function PlanPage({ params }: PageProps<"/plans/[slug]">) {
  return (
    <Container className="py-8 sm:py-12">
      <Link
        href="/plans"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        All plans
      </Link>
      <Suspense fallback={<PlanFallback />}>
        <PlanDetails params={params} />
      </Suspense>
    </Container>
  )
}

async function PlanDetails({ params }: Pick<PageProps<"/plans/[slug]">, "params">) {
  const { slug } = await params
  const [plan, addon, destinations] = await Promise.all([getPlanBySlug(slug), getIntlCallingAddon(), getCallingDestinations()])
  if (!plan) notFound()

  return (
    <>
      <JsonLd data={productJsonLd(plan)} />
      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_26rem] lg:gap-14">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <CarrierLogo carrier={plan.carrier} size="sm" />
            <ProductBadge type={plan.product_type} />
          </div>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">{plan.name}</h1>
          {plan.summary ? <p className="mt-3 text-lg text-muted-foreground">{plan.summary}</p> : null}

          <section aria-labelledby="details" className="mt-10">
            <h2 id="details" className="text-xl font-semibold">
              Plan details
            </h2>
            <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
              <Detail icon={<PhoneIcon className="size-5" />} label="Talk" value={plan.talk} />
              <Detail icon={<ChatTextIcon className="size-5" />} label="Text" value={plan.sms} />
              <Detail
                icon={<WifiHighIcon className="size-5" />}
                label="Data"
                value={dataLabel(plan)}
              />
              <Detail
                icon={<ShareNetworkIcon className="size-5" />}
                label="Hotspot"
                value={hotspotLabel(plan)}
              />
              <Detail
                icon={<GaugeIcon className="size-5" />}
                label="Speed"
                value={plan.network}
                note={plan.slowdown_after_gb !== null ? slowdownLabel(plan) : undefined}
              />
              <Detail
                icon={<GlobeHemisphereWestIcon className="size-5" />}
                label="Countries covered"
                value={plan.countries_covered.join(", ")}
              />
            </dl>
          </section>

          {plan.description ? (
            <section aria-labelledby="about-plan" className="mt-10">
              <h2 id="about-plan" className="text-xl font-semibold">
                About this plan
              </h2>
              <div className="mt-3 max-w-[65ch] space-y-4 text-foreground/80">
                {plan.description.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="delivery" className="mt-10">
            <h2 id="delivery" className="text-xl font-semibold">
              Delivery
            </h2>
            <p className="mt-3 max-w-[65ch] text-foreground/80">
              {plan.product_type === "esim"
                ? "Your eSIM arrives as a QR code, by email and on your private order page. Scan it with your phone's camera to install the line. Your phone needs to support eSIM and be unlocked."
                : "We post your SIM card from the US by USPS. The tracking number appears on your private order page as soon as it ships."}
            </p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border bg-card p-5 sm:p-6">
            <p className="text-sm font-medium">
              {plan.carrier.name} {productTypeLabel[plan.product_type]}
            </p>
            <p className="font-heading text-2xl font-semibold tracking-[-0.02em]">{plan.name}</p>
            <PlanConfigurator plan={plan} addon={addon} callingList={destinations.length > 0} className="mt-6" />
          </div>
        </aside>
      </div>
    </>
  )
}

function Detail({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="flex gap-4 bg-card p-5">
      <span aria-hidden className="mt-0.5 text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 font-medium">{value}</dd>
        {note ? <dd className="mt-0.5 text-sm text-muted-foreground">{note}</dd> : null}
      </div>
    </div>
  )
}

function PlanFallback() {
  return (
    <div aria-hidden className="mt-4 grid gap-10 lg:grid-cols-[1fr_26rem] lg:gap-14">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-12 w-3/4" />
        <Skeleton className="mt-10 h-72 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

function productJsonLd(plan: CatalogPlan) {
  const prices = plan.packages.map((p) => p.price_cents / 100)
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${plan.carrier.name} ${plan.name} ${productTypeLabel[plan.product_type]}`,
    description: plan.summary || plan.description,
    category: plan.product_type === "esim" ? "eSIM" : "SIM card",
    brand: { "@type": "Brand", name: plan.carrier.name },
    url: absoluteUrl(`/plans/${plan.slug}`),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: plan.packages.length,
      availability: "https://schema.org/InStock",
      offers: plan.packages.map((p) => ({
        "@type": "Offer",
        name: `${p.days} ${p.days === 1 ? "day" : "days"}`,
        price: (p.price_cents / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: absoluteUrl(`/plans/${plan.slug}`),
      })),
    },
  }
}

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
