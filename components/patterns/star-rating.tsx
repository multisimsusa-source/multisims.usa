"use client"

import * as React from "react"
import { StarIcon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

const labels = ["1 star, poor", "2 stars", "3 stars", "4 stars", "5 stars, excellent"]

/**
 * Five stars as a radio group: 44px targets, arrow keys move between them, each named
 * "1 star" to "5 stars". The chosen number is also said in words next to the stars.
 */
export function StarRatingInput({
  name,
  value,
  onChange,
  labelledBy,
}: {
  name: string
  value: number
  onChange: (value: number) => void
  labelledBy: string
}) {
  const [hover, setHover] = React.useState(0)
  const shown = hover || value
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-labelledby={labelledBy} className="flex" onMouseLeave={() => setHover(0)}>
        {labels.map((label, i) => {
          const n = i + 1
          const on = n <= shown
          return (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="flex size-11 cursor-pointer items-center justify-center rounded-md transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={label} className="sr-only" />
              <StarIcon weight={on ? "fill" : "regular"} className={cn("size-7 transition-colors", on ? "text-copper" : "text-muted-foreground")} />
            </label>
          )
        })}
      </div>
      <span aria-hidden className="text-sm text-muted-foreground">
        {value ? `${value} of 5` : "Tap a star"}
      </span>
    </div>
  )
}

/** A given rating, read-only. Screen readers hear "Rated 4 out of 5". */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span role="img" aria-label={`Rated ${rating} out of 5`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} aria-hidden weight={n <= rating ? "fill" : "regular"} className={cn("size-4", n <= rating ? "text-copper" : "text-muted-foreground/60")} />
      ))}
    </span>
  )
}
