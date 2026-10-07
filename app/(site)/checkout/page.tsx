import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Container } from "@/components/site/section"
import { getIntlCallingAddon, getPlanBySlug } from "@/lib/catalog"
import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

// Placeholder until crypto checkout lands in Milestone 2.
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
}

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <Container className="max-w-2xl py-12 sm:py-16">
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
        <CheckoutSummary searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}

async function CheckoutSummary({ searchParams }: Pick<PageProps<"/checkout">, "searchParams">) {
  const params = await searchParams
  const slug = typeof params.plan === "string" ? params.plan : ""
  const days = Number(params.days)
  const intl = params.intl === "1"

  const [plan, addon] = await Promise.all([getPlanBySlug(slug), getIntlCallingAddon()])
  const pkg = plan?.packages.find((p) => p.days === days)

  if (!plan || !pkg) {
    return (
      <div className="rounded-xl border p-8 text-center">
        <h1 className="text-2xl font-semibold">Choose a plan first</h1>
        <p className="mt-2 text-muted-foreground">This plan or day package is no longer available.</p>
        <Link href="/plans" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11")}>
          Browse plans
        </Link>
      </div>
    )
  }

  const addonCents = intl && addon ? addon.price_cents : 0

  return (
    <>
      <Link
        href={`/plans/${plan.slug}`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to plan
      </Link>
      <h1 className="mt-4 text-4xl font-semibold">Checkout</h1>
      <div className="mt-8 rounded-xl border bg-card">
        <dl className="divide-y">
          <Row label="Plan" value={`${plan.carrier.name} ${plan.name}`} />
          <Row label="Product" value={productTypeLabel[plan.product_type]} />
          <Row label="Days" value={formatDays(pkg.days)} />
          <Row label="Price" value={formatPrice(pkg.price_cents)} mono />
          {intl && addon ? <Row label={addon.name} value={`+${formatPrice(addon.price_cents)}`} mono /> : null}
          <Row label="Total" value={formatPrice(pkg.price_cents + addonCents)} mono strong />
        </dl>
      </div>
      <p className="mt-6 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-ink">
        Online checkout is not open yet. Payment in USDT and Bitcoin is coming soon.
      </p>
    </>
  )
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <dt className={cn("text-sm", strong ? "font-medium" : "text-muted-foreground")}>{label}</dt>
      <dd className={cn(mono && "font-mono tabular", strong ? "text-lg font-medium" : "text-sm")}>{value}</dd>
    </div>
  )
}
