import Link from "next/link"
import { ArrowRightIcon } from "@phosphor-icons/react/ssr"

import { CarrierLogo } from "@/components/site/carrier-logo"
import { ProductBadge } from "@/components/site/product-mark"
import { formatPrice } from "@/lib/format"
import type { CatalogSimCard } from "@/lib/catalog"

/**
 * A carrier's SIM card on its own, beside the plan cards: a price and never a length.
 * A plan can still be added at checkout; without one it is activated later.
 */
export function SimCardCard({ card }: { card: CatalogSimCard }) {
  return (
    <article className="group relative flex flex-col rounded-xl border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 hover:shadow-[0_2px_10px_rgb(20_20_18/0.04)] sm:p-6">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <CarrierLogo carrier={card.carrier} size="sm" />
        <ProductBadge type="physical" />
      </div>
      <h3 className="mt-5 text-xl font-semibold">
        <Link
          href={`/checkout?card=${card.carrier.slug}`}
          className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/40"
        >
          {card.carrier.name} SIM card
        </Link>
      </h3>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
        The card on its own. Add a plan at checkout, or activate it later.
      </p>
      <div className="mt-auto flex items-end justify-between gap-4 border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Price</p>
          <p className="font-mono text-xl font-medium tracking-tight tabular-nums">{formatPrice(card.price_cents)}</p>
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
