"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  SimCardIcon,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CarrierLogo } from "@/components/site/carrier-logo"
import type { Carrier, ProductType } from "@/lib/types"

export type SearchPlan = {
  slug: string
  name: string
  carrier: Pick<Carrier, "name" | "logo_path">
  productType: ProductType
  facts: string
  from: string
  /** Everything a buyer might type for this plan, as one string. */
  search: string
}

export type SearchCarrier = {
  slug: string
  name: string
  logo_path: string | null
}

/** Header search over the published plans. Opens from the icon, Cmd/Ctrl+K or "/". */
export function PlanSearch({
  plans,
  carriers,
}: {
  plans: SearchPlan[]
  carriers: SearchCarrier[]
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const router = useRouter()

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing = target?.closest(
        "input, textarea, select, [contenteditable=true]"
      )
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !typing)
      ) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const results = React.useMemo(() => matchPlans(plans, query), [plans, query])

  function go(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Search plans"
              aria-keyshortcuts="Meta+K Control+K"
              onClick={() => setOpen(true)}
              className="size-11 text-muted-foreground hover:text-foreground"
            >
              <MagnifyingGlassIcon weight="bold" className="size-5" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          Search plans
          <kbd className="ml-1 rounded border border-background/25 px-1 font-mono text-[0.65rem]">
            /
          </kbd>
        </TooltipContent>
      </Tooltip>

      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQuery("")
        }}
        title="Search plans"
        description="Search US SIM and eSIM plans by carrier, plan name or feature."
        className="max-sm:top-3 max-sm:max-w-[calc(100%-1.5rem)]"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search plans, carriers or features"
          />
          <CommandList>
            <CommandEmpty>
              <p>No plans match &ldquo;{query}&rdquo;.</p>
              <button
                type="button"
                onClick={() => go("/plans")}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-medium text-brand underline-offset-4 hover:underline"
              >
                Browse all plans
                <ArrowRightIcon weight="bold" className="size-4" />
              </button>
            </CommandEmpty>

            {query ? null : (
              <>
                <CommandGroup heading="Browse">
                  <CommandItem
                    value="browse esim plans"
                    onSelect={() => go("/plans?type=esim")}
                  >
                    <QrCodeIcon
                      weight="bold"
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                    eSIM plans
                  </CommandItem>
                  <CommandItem
                    value="browse sim card plans"
                    onSelect={() => go("/plans?type=physical")}
                  >
                    <SimCardIcon
                      weight="bold"
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                    SIM card plans
                  </CommandItem>
                </CommandGroup>
                {carriers.length ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Carriers">
                      {carriers.map((c) => (
                        <CommandItem
                          key={c.slug}
                          value={`carrier ${c.name}`}
                          onSelect={() => go(`/plans?carrier=${c.slug}`)}
                        >
                          <span className="flex w-24 shrink-0 items-center">
                            <CarrierLogo carrier={c} size="sm" />
                          </span>
                          <span className="text-muted-foreground">
                            {c.name} plans
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}
              </>
            )}

            {query ? (
              <CommandGroup heading="Plans">
                {results.map((plan) => (
                  <CommandItem
                    key={plan.slug}
                    value={`${plan.carrier.name} ${plan.name} ${plan.slug}`}
                    onSelect={() => go(`/plans/${plan.slug}`)}
                    className="items-start py-2.5"
                  >
                    <span className="flex h-6 w-16 shrink-0 items-center sm:w-20">
                      <CarrierLogo carrier={plan.carrier} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{plan.name}</span>
                      <span className="block text-xs text-muted-foreground sm:truncate">
                        {plan.productType === "esim" ? "eSIM" : "SIM card"} ·{" "}
                        {plan.facts}
                      </span>
                      {/* Phones: the price joins the details instead of squeezing them. */}
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums sm:hidden">
                        from {plan.from}
                      </span>
                    </span>
                    <span className="hidden shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums sm:block">
                      from {plan.from}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="hidden items-center gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
            </span>
            <span>
              <Kbd>↵</Kbd> to open
            </span>
            <span>
              <Kbd>esc</Kbd> to close
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  )
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/e-sim/g, "esim")
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/**
 * Whole-word matching: every word typed must appear in the plan's text (spaces ignored,
 * so "tmobile" finds T-Mobile). Stricter than fuzzy matching, so nonsense finds nothing.
 */
function matchPlans(plans: SearchPlan[], query: string) {
  const words = normalise(query).split(" ").filter(Boolean)
  if (!words.length) return []
  return plans.filter((plan) => {
    const text = normalise(plan.search)
    const compact = text.replace(/ /g, "")
    return words.every((w) => text.includes(w) || compact.includes(w))
  })
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">
      {children}
    </kbd>
  )
}
