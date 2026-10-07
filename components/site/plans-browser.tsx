"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { XIcon } from "@phosphor-icons/react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CarrierLogo } from "@/components/site/carrier-logo"
import type { ProductType } from "@/lib/types"
import { cn } from "@/lib/utils"

export type PlanSort = "recommended" | "price-asc" | "price-desc" | "data"

type Props = {
  type?: ProductType
  carrier?: string
  sort: PlanSort
  total: number
  typeCounts: { all: number; esim: number; physical: number }
  carriers: { slug: string; name: string; logo_path: string | null; count: number }[]
  children: React.ReactNode
}

const ALL = "all"
const sortItems: { value: PlanSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price-asc", label: "Lowest price" },
  { value: "price-desc", label: "Highest price" },
  { value: "data", label: "Most data" },
]

/**
 * Filter and sort toolbar for the plans list. Choices apply at once and live in the URL,
 * so a filtered list can be shared and the back button works. The list dims while the
 * next result loads.
 */
export function PlansBrowser({ type, carrier, sort, total, typeCounts, carriers, children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()

  function apply(next: Partial<{ type: string; carrier: string; sort: string }>) {
    const q = new URLSearchParams()
    const t = "type" in next ? next.type : type
    const c = "carrier" in next ? next.carrier : carrier
    const s = "sort" in next ? next.sort : sort
    if (t && t !== ALL) q.set("type", t)
    if (c && c !== ALL) q.set("carrier", c)
    if (s && s !== "recommended") q.set("sort", s)
    const query = q.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  const typeItems = [
    { value: ALL, label: "All", count: typeCounts.all },
    { value: "esim", label: "eSIM", count: typeCounts.esim },
    { value: "physical", label: "SIM card", count: typeCounts.physical },
  ]
  const carrierItems = [
    { value: ALL, label: "All", count: carriers.reduce((n, c) => n + c.count, 0) },
    ...carriers.map((c) => ({ value: c.slug, label: c.name, count: c.count })),
  ]
  const activeCarrier = carriers.find((c) => c.slug === carrier)
  const active = [
    type ? { key: "type", label: type === "esim" ? "eSIM" : "SIM card", clear: () => apply({ type: ALL }) } : null,
    activeCarrier ? { key: "carrier", label: activeCarrier.name, clear: () => apply({ carrier: ALL }) } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <>
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-h-10 flex-wrap items-center gap-2" aria-live="polite">
          <p className="mr-1 text-sm font-medium">
            {total === 1 ? "1 plan" : `${total} plans`}
          </p>
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={f.clear}
              aria-label={`Remove filter: ${f.label}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft pr-2 pl-3 text-sm text-brand-ink transition-colors hover:bg-brand-soft/70 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              {f.label}
              <XIcon weight="bold" aria-hidden className="size-3.5" />
            </button>
          ))}
          {active.length > 1 ? (
            <button
              type="button"
              onClick={() => apply({ type: ALL, carrier: ALL })}
              className="inline-flex h-8 items-center px-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-busy={pending}>
          <Select items={typeItems} value={type ?? ALL} onValueChange={(v) => apply({ type: String(v ?? ALL) })}>
            <FilterTrigger label="Product" ariaLabel="Filter by product" />
            <SelectContent>
              {typeItems.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  disabled={item.count === 0 && item.value !== (type ?? ALL)}
                  className="pr-10"
                >
                  <span className="flex-1">{item.label}</span>
                  <Count n={item.count} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select items={carrierItems} value={carrier ?? ALL} onValueChange={(v) => apply({ carrier: String(v ?? ALL) })}>
            <FilterTrigger label="Carrier" ariaLabel="Filter by carrier" />
            <SelectContent className="min-w-60">
              {carrierItems.map((item) => {
                const c = carriers.find((x) => x.slug === item.value)
                return (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    disabled={item.count === 0 && item.value !== (carrier ?? ALL)}
                    className="pr-10"
                  >
                    <span className="flex w-20 shrink-0 items-center">
                      {c ? <CarrierLogo carrier={c} size="sm" /> : <span>All carriers</span>}
                    </span>
                    <span className="sr-only">{item.label}</span>
                    <span className="flex-1" />
                    <Count n={item.count} />
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>

          <Select items={sortItems} value={sort} onValueChange={(v) => apply({ sort: String(v ?? "recommended") })}>
            <FilterTrigger label="Sort" ariaLabel="Sort plans" className="col-span-2 sm:col-span-1" />
            <SelectContent>
              {sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        data-pending={pending || undefined}
        className="transition-opacity duration-200 data-pending:pointer-events-none data-pending:opacity-55"
      >
        {children}
      </div>
    </>
  )
}

function FilterTrigger({ label, ariaLabel, className }: { label: string; ariaLabel: string; className?: string }) {
  return (
    <SelectTrigger aria-label={ariaLabel} className={cn("w-full min-w-0 gap-2 data-[size=default]:h-11 sm:w-auto sm:min-w-44", className)}>
      <span className="text-muted-foreground">{label}</span>
      <SelectValue className="flex-1 text-left font-medium" />
    </SelectTrigger>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-3 font-mono text-xs text-muted-foreground tabular-nums">{n}</span>
}
