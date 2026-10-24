"use client"

import { useNow } from "@/hooks/use-now"
import { elapsed } from "@/lib/orders"
import { cn } from "@/lib/utils"

/** Time since a moment, ticking every 30 seconds. Turns amber past `warnAfterMin`. */
export function Age({
  since,
  warnAfterMin,
  className,
}: {
  since: string
  warnAfterMin?: number
  className?: string
}) {
  const now = useNow(30_000)
  const start = new Date(since).getTime()
  const late =
    warnAfterMin !== undefined &&
    now !== null &&
    now - start > warnAfterMin * 60_000
  return (
    <time
      dateTime={since}
      title={new Date(since).toLocaleString()}
      suppressHydrationWarning
      className={cn(
        "tabular font-mono",
        late ? "font-medium text-warning-ink" : "text-muted-foreground",
        className
      )}
    >
      {now !== null ? elapsed(since, new Date(Math.max(now, start))) : ""}
    </time>
  )
}
