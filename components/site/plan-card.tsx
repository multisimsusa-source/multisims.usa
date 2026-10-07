import Link from "next/link"
import { ArrowRightIcon, ChatTextIcon, ShareNetworkIcon, WifiHighIcon } from "@phosphor-icons/react/ssr"

import { CarrierLogo } from "@/components/site/carrier-logo"
import { ProductBadge } from "@/components/site/product-mark"
import { dataLabel, formatPrice, hotspotLabel } from "@/lib/format"
import type { CatalogPlan } from "@/lib/types"

export function PlanCard({ plan }: { plan: CatalogPlan }) {
  const shortest = plan.packages[0]
  const longest = plan.packages[plan.packages.length - 1]
  const hasHotspot = Boolean(plan.hotspot_gb)

  return (
    <article className="group relative flex flex-col rounded-xl border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 hover:shadow-[0_2px_10px_rgb(20_20_18/0.04)] sm:p-6">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <CarrierLogo carrier={plan.carrier} size="sm" />
        <ProductBadge type={plan.product_type} />
      </div>

      <h3 className="mt-5 text-xl font-semibold">
        {/* The whole card is the link: the ::after covers it. */}
        <Link
          href={`/plans/${plan.slug}`}
          className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/40"
        >
          {plan.name}
        </Link>
      </h3>
      {plan.summary ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{plan.summary}</p> : null}

      <dl className="mt-5 mb-6 space-y-2 text-sm">
        <Fact icon={<WifiHighIcon className="size-4" />} term="Data">
          {dataLabel(plan)}
        </Fact>
        <Fact
          icon={<ShareNetworkIcon className="size-4" />}
          term="Hotspot"
          muted={!hasHotspot}
        >
          {hotspotLabel(plan)}
        </Fact>
        <Fact icon={<ChatTextIcon className="size-4" />} term="Talk and text" muted>
          {plan.talk}, {plan.sms.replace(/^Unlimited US /, "").toLowerCase()}
        </Fact>
      </dl>

      <div className="mt-auto flex items-end justify-between gap-4 border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">{shortest.days === longest.days ? "Price" : "From"}</p>
          <p className="font-mono text-xl font-medium tracking-tight tabular-nums">
            {formatPrice(plan.from_price_cents)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shortest.days === longest.days
              ? `${shortest.days} ${shortest.days === 1 ? "day" : "days"}`
              : `${shortest.days} to ${longest.days} days`}
          </p>
        </div>
        <span
          aria-hidden
          className="inline-flex size-10 items-center justify-center rounded-md border transition-colors duration-150 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"
        >
          <ArrowRightIcon weight="bold" className="size-4" />
        </span>
      </div>
    </article>
  )
}

function Fact({
  icon,
  term,
  muted = false,
  children,
}: {
  icon: React.ReactNode
  term: string
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="text-muted-foreground">
        {icon}
      </span>
      <dt className="sr-only">{term}</dt>
      <dd className={muted ? "text-muted-foreground" : undefined}>{children}</dd>
    </div>
  )
}
