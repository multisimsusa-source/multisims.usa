"use client"

import * as React from "react"
import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/**
 * One fewer / count / one more, with 44px buttons. `editable` lets the count be typed
 * (dealer bulk orders of hundreds); otherwise it is read out as a live region.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  labelledBy,
  label,
  editable,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max: number
  /** Id of the visible label, or `label` for an accessible name when there is none. */
  labelledBy?: string
  label?: string
  editable?: boolean
  className?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))
  // While typing, the field shows what was typed (it may be empty); otherwise the value.
  const [draft, setDraft] = React.useState<string | null>(null)

  return (
    <div role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} className={cn("flex items-center rounded-md border bg-background", className)}>
      <button
        type="button"
        aria-label="One fewer"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="flex size-11 shrink-0 items-center justify-center rounded-l-md transition-colors hover:bg-muted disabled:opacity-35"
      >
        <MinusIcon className="size-4" />
      </button>
      {editable ? (
        <input
          type="text"
          inputMode="numeric"
          aria-label="Quantity"
          value={draft ?? String(value)}
          onFocus={() => setDraft(String(value))}
          onChange={(e) => {
            const next = e.currentTarget.value.replace(/\D/g, "").slice(0, 4)
            setDraft(next)
            if (next !== "") onChange(clamp(Number(next)))
          }}
          onBlur={() => setDraft(null)}
          className="h-11 w-14 min-w-0 bg-transparent text-center font-mono tabular outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <output aria-live="polite" className="w-9 text-center font-mono tabular">
          {value}
        </output>
      )}
      <button
        type="button"
        aria-label="One more"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="flex size-11 shrink-0 items-center justify-center rounded-r-md transition-colors hover:bg-muted disabled:opacity-35"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
