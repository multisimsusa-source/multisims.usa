import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * A price, and when it is on sale the regular price struck through after it. Screen
 * readers hear "was $30.00"; the strike is never the only signal.
 */
export function PriceWithSale({
  cents,
  regularCents,
  className,
  regularClassName,
}: {
  cents: number
  regularCents?: number | null
  className?: string
  regularClassName?: string
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 font-mono tabular", className)}>
      <span>{formatPrice(cents)}</span>
      {regularCents ? (
        <s className={cn("text-[0.8em] font-normal text-muted-foreground no-underline decoration-1 [text-decoration-line:line-through]", regularClassName)}>
          <span className="sr-only">was </span>
          {formatPrice(regularCents)}
        </s>
      ) : null}
    </span>
  )
}
