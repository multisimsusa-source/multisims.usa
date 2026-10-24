"use client"

import * as React from "react"
import { GlobeHemisphereWestIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { minutesLabel, type Destination } from "@/lib/calling-destinations"
import { cn } from "@/lib/utils"

/**
 * "See where you can call": the international calling destinations with their minutes,
 * searchable. Fetched when opened, so plan pages stay light.
 */
export function CallingDestinations({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [list, setList] = React.useState<Destination[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [q, setQ] = React.useState("")

  React.useEffect(() => {
    if (!open || list) return
    let cancelled = false
    fetch("/api/calling-destinations")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Destination[]) => !cancelled && setList(data))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [open, list])

  const term = q.trim().toLowerCase()
  const shown = (list ?? []).filter((d) => !term || d.name.toLowerCase().includes(term))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm text-brand underline-offset-4 hover:underline", className)}>
            <GlobeHemisphereWestIcon className="size-4" />
            See where you can call
          </button>
        }
      />
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Where you can call</DialogTitle>
          <DialogDescription>Minutes to each destination with international calling. Cellular means calls to mobile numbers there.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search a country" aria-label="Search a country" className="pl-9" />
        </div>
        <div className="-mx-1 min-h-40 flex-1 overflow-y-auto px-1" aria-live="polite">
          {failed ? (
            <p className="py-6 text-center text-sm text-muted-foreground">The list did not load. Close this and try again.</p>
          ) : !list ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading the list...</p>
          ) : shown.length ? (
            <ul className="divide-y text-sm">
              {shown.map((d) => (
                <li key={d.name} className="flex items-baseline justify-between gap-4 py-2">
                  <span className="min-w-0">{d.name}</span>
                  <span className={cn("shrink-0 font-mono tabular", d.minutes_cap === null ? "text-success-ink" : "text-muted-foreground")}>{minutesLabel(d.minutes_cap)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{list.length ? `No destination matches "${q.trim()}".` : "The list is not available yet."}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
