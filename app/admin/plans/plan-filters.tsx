"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "all"

type Props = {
  carriers: { id: string; name: string }[]
  carrier: string
  type: string
  query: string
}

/** Applies as you choose or type; filters live in the URL so they survive reloads and links. */
export function PlanFilters({ carriers, carrier, type, query }: Props) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [text, setText] = React.useState(query)

  const carrierItems = [{ value: ALL, label: "All carriers" }, ...carriers.map((c) => ({ value: c.id, label: c.name }))]
  const typeItems = [
    { value: ALL, label: "eSIM and SIM card" },
    { value: "esim", label: "eSIM only" },
    { value: "physical", label: "SIM card only" },
  ]

  const apply = React.useCallback(
    (next: { carrier?: string; type?: string; q?: string }) => {
      const q = new URLSearchParams()
      const c = next.carrier ?? carrier
      const t = next.type ?? type
      const s = (next.q ?? query).trim()
      if (c && c !== ALL) q.set("carrier", c)
      if (t && t !== ALL) q.set("type", t)
      if (s) q.set("q", s)
      const qs = q.toString()
      startTransition(() => router.replace(qs ? `/admin/plans?${qs}` : "/admin/plans", { scroll: false }))
    },
    [carrier, type, query, router]
  )

  // Search a moment after typing stops, not on every key.
  React.useEffect(() => {
    if (text.trim() === query) return
    const id = window.setTimeout(() => apply({ q: text }), 250)
    return () => window.clearTimeout(id)
  }, [text, query, apply])

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]" aria-busy={pending}>
      <div className="relative">
        <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search plans by name"
          aria-label="Search plans"
          className="h-10 bg-background pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            onClick={() => setText("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon weight="bold" className="size-3.5" />
          </button>
        ) : null}
      </div>
      <Select items={carrierItems} value={carrier || ALL} onValueChange={(v) => apply({ carrier: String(v ?? ALL) })}>
        <SelectTrigger aria-label="Filter by carrier" className="h-10 w-full bg-background sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {carrierItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={typeItems} value={type || ALL} onValueChange={(v) => apply({ type: String(v ?? ALL) })}>
        <SelectTrigger aria-label="Filter by product" className="h-10 w-full bg-background sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {typeItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
