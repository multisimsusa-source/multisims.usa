import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * What an order does to the dealer's balance: available now, this order, and what is
 * left after it (or how much is missing, said in words). Announced as it changes.
 */
export function WalletMeter({ availableCents, orderCents, className }: { availableCents: number; orderCents: number; className?: string }) {
  const left = availableCents - orderCents
  const short = left < 0
  return (
    <dl aria-live="polite" className={cn("space-y-1.5 text-sm", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">Available now</dt>
        <dd className="font-mono tabular">{formatPrice(availableCents)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">This order</dt>
        <dd className="font-mono tabular">{formatPrice(orderCents)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
        <dt className={cn("font-medium", short && "text-danger-ink")}>{short ? "Missing" : "Left after"}</dt>
        <dd className={cn("font-mono font-medium tabular", short && "text-danger-ink")}>{formatPrice(Math.abs(left))}</dd>
      </div>
    </dl>
  )
}
