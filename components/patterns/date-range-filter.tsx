"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Choose dates" },
]

/**
 * A date range in the URL (?range=7d, or range=custom&from=&to=), so a report can be
 * reloaded, shared and gone back from. Other params are kept.
 */
export function DateRangeFilter({ params, from, to }: { params: Record<string, string>; from: string; to: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = React.useTransition()
  const preset = PRESETS.some((p) => p.value === params.range) ? params.range : "30d"
  const [custom, setCustom] = React.useState(preset === "custom")
  const [a, setA] = React.useState(from)
  const [b, setB] = React.useState(to)

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  return (
    <div className="flex flex-wrap items-end gap-2" aria-busy={pending}>
      <Select
        items={PRESETS}
        value={custom ? "custom" : preset}
        onValueChange={(v) => {
          const value = String(v)
          if (value === "custom") return setCustom(true)
          setCustom(false)
          go({ range: value, from: null, to: null })
        }}
      >
        <SelectTrigger aria-label="Date range" className="w-44 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {custom ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (a && b && a <= b) go({ range: "custom", from: a, to: b })
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={a} max={b || undefined} onChange={(e) => setA(e.currentTarget.value)} className="w-40 bg-background" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={b} min={a || undefined} onChange={(e) => setB(e.currentTarget.value)} className="w-40 bg-background" />
          </label>
          <Button type="submit" variant="outline" size="lg" disabled={!a || !b || a > b || pending}>
            Show
          </Button>
        </form>
      ) : null}
    </div>
  )
}
