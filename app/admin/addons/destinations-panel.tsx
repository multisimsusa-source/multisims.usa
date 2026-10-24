"use client"

import * as React from "react"
import { ArrowsClockwiseIcon, DownloadSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { minutesLabel, type Destination } from "@/lib/calling-destinations"
import { cn } from "@/lib/utils"
import { replaceDestinations } from "./actions"

/** The international calling destinations: search, download, replace from the carrier's list. */
export function DestinationsPanel({ addonId, destinations }: { addonId: string; destinations: Destination[] }) {
  const [q, setQ] = React.useState("")
  const term = q.trim().toLowerCase()
  const shown = destinations.filter((d) => !term || d.name.toLowerCase().includes(term))
  const unlimited = destinations.filter((d) => d.minutes_cap === null).length

  return (
    <section aria-labelledby="destinations-title" className="rounded-xl border bg-background">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <h2 id="destinations-title" className="type-card-title">
            Where international calling reaches
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {destinations.length ? (
              <>
                <span className="tabular">{destinations.length}</span> destinations, <span className="tabular">{unlimited}</span> unlimited. Buyers see this under
                &quot;See where you can call&quot;.
              </>
            ) : (
              "No list yet. Buyers do not see the link until there is one."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {destinations.length ? (
            <a href="/admin/addons/destinations.csv" download className={buttonVariants({ variant: "outline", size: "lg" })}>
              <DownloadSimpleIcon data-icon="inline-start" />
              CSV
            </a>
          ) : null}
          <ReplaceButton addonId={addonId} />
        </div>
      </div>
      {destinations.length ? (
        <div className="p-4 sm:p-6">
          <div className="relative">
            <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search a destination" aria-label="Search a destination" className="pl-9" />
          </div>
          <ul className="mt-3 max-h-96 divide-y overflow-y-auto rounded-lg border text-sm">
            {shown.map((d) => (
              <li key={d.name} className="flex items-baseline justify-between gap-4 px-3 py-2">
                <span className="min-w-0">{d.name}</span>
                <span className={cn("shrink-0 font-mono tabular", d.minutes_cap === null ? "text-success-ink" : "text-muted-foreground")}>{minutesLabel(d.minutes_cap)}</span>
              </li>
            ))}
            {!shown.length ? <li className="px-3 py-6 text-center text-muted-foreground">Nothing matches.</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function ReplaceButton({ addonId }: { addonId: string }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [pending, start] = React.useTransition()
  const id = React.useId()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" variant="outline">
            <ArrowsClockwiseIcon data-icon="inline-start" />
            Replace list
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Replace the destinations list</DialogTitle>
          <DialogDescription>The whole list is replaced by what you paste. Download the CSV first if you want a copy of the current one.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const result = await replaceDestinations(addonId, text)
              if (!result.ok) return void toast.error(result.error)
              toast.success(result.message ?? "Saved")
              setText("")
              setOpen(false)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor={id}>Destinations</FieldLabel>
            <Textarea id={id} rows={10} value={text} onChange={(e) => setText(e.currentTarget.value)} spellCheck={false} className="font-mono text-sm" />
            <FieldDescription>One per line: the name, then the minutes or Unlimited, separated by a comma. Text copied from the carrier&apos;s rate table works too.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending || !text.trim()}>
              {pending ? "Saving..." : "Replace list"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
