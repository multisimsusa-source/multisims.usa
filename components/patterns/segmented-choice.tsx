"use client"

import { cn } from "@/lib/utils"

/**
 * A small set of mutually exclusive choices shown side by side, like "eSIM or SIM card?":
 * real radio inputs (keyboard and screen readers work as for any radio group), the chosen
 * one filled with the brand colour. Each option is at least 44px high.
 */
export function SegmentedChoice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  className,
}: {
  legend: string
  name: string
  options: { value: T; label: string; hint?: string }[]
  value: T | null
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", options.length === 2 ? "grid-cols-2 sm:max-w-sm" : "grid-cols-1 sm:grid-cols-3")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              value === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
            {o.hint ? (
              <span className={cn("tabular mt-0.5 font-mono text-xs font-normal", value === o.value ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {o.hint}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
