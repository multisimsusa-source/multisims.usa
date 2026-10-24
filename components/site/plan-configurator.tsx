"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, PhoneIcon } from "@phosphor-icons/react"

import { buttonVariants } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { PriceWithSale } from "@/components/patterns/price-with-sale"
import { CallingDestinations } from "@/components/site/calling-destinations"
import { formatDays, formatPrice } from "@/lib/format"
import type { CatalogPlan } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  plan: Pick<CatalogPlan, "slug" | "name" | "packages">
  addon: { name: string; description: string; price_cents: number } | null
  /** Compact is the home-page preview; full is the plan page. */
  variant?: "full" | "compact"
  defaultDays?: number
  /** Show "See where you can call" under the calling switch. */
  callingList?: boolean
  className?: string
}

export function PlanConfigurator({ plan, addon, variant = "full", defaultDays = 30, callingList, className }: Props) {
  const groupId = React.useId()
  const packages = plan.packages
  const initial = packages.find((p) => p.days === defaultDays) ?? packages[0]
  const [packageId, setPackageId] = React.useState(initial.id)
  const [intl, setIntl] = React.useState(false)

  const selected = packages.find((p) => p.id === packageId) ?? initial
  const total = selected.price_cents + (intl && addon ? addon.price_cents : 0)
  const checkoutHref = `/checkout?plan=${plan.slug}&days=${selected.days}${intl ? "&intl=1" : ""}`
  const compact = variant === "compact"

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <fieldset>
        <legend className="mb-3 text-sm font-medium">How many days?</legend>
        <div
          className={cn(
            "grid grid-cols-3 gap-2 sm:grid-cols-4",
            // The home hero card is narrow on desktop; four tiles would wrap "7 days".
            compact && "lg:grid-cols-3"
          )}
        >
          {packages.map((pkg) => {
            const checked = pkg.id === packageId
            return (
              <label
                key={pkg.id}
                className={cn(
                  "sim-cut relative flex min-h-16 cursor-pointer flex-col justify-center rounded-md px-3 py-2.5 transition-colors duration-150 [--sim-cut:12px]",
                  "has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-focus-visible:ring-inset",
                  checked
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-accent dark:hover:bg-secondary"
                )}
              >
                <input
                  type="radio"
                  name={groupId}
                  value={pkg.id}
                  checked={checked}
                  onChange={() => setPackageId(pkg.id)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold leading-tight">{formatDays(pkg.days)}</span>
                <span
                  className={cn(
                    "font-mono text-xs tabular",
                    checked ? "text-primary-foreground/75" : "text-muted-foreground"
                  )}
                >
                  <PriceWithSale cents={pkg.price_cents} regularCents={pkg.regular_price_cents} regularClassName={checked ? "text-primary-foreground/60" : undefined} />
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {addon ? (
        <label
          htmlFor={`${groupId}-intl`}
          className="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:border-foreground/20"
        >
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <PhoneIcon weight="bold" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              Add {addon.name.toLowerCase()}{" "}
              <span className="font-mono font-normal text-muted-foreground tabular">
                +{formatPrice(addon.price_cents)}
              </span>
            </span>
            {!compact && addon.description ? (
              <span className="mt-0.5 block text-sm text-muted-foreground">{addon.description}</span>
            ) : null}
          </span>
          <Switch id={`${groupId}-intl`} checked={intl} onCheckedChange={setIntl} />
        </label>
      ) : null}
      {addon && callingList && !compact ? <CallingDestinations className="-mt-4 self-start" /> : null}

      <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite">
          <p className="text-sm text-muted-foreground">
            {formatDays(selected.days)}
            {intl && addon ? ` with ${addon.name.toLowerCase()}` : ""}
          </p>
          <p className="font-mono text-3xl font-medium tracking-tight tabular">{formatPrice(total)}</p>
          {selected.regular_price_cents ? (
            <p className="mt-0.5 text-sm text-success-ink">
              Sale price. You save <span className="font-mono tabular">{formatPrice(selected.regular_price_cents - selected.price_cents)}</span>
            </p>
          ) : null}
        </div>
        <Link
          href={checkoutHref}
          className={cn(buttonVariants({ size: "lg" }), "h-12 w-full px-6 text-base sm:w-auto")}
        >
          Buy now
          <ArrowRightIcon weight="bold" data-icon="inline-end" />
        </Link>
      </div>
    </div>
  )
}
