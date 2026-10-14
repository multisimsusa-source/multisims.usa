import { cn } from "@/lib/utils"

/**
 * A summary of facts as label/value rows divided by hairlines: order details, receipts.
 * One column at every width, so odd counts never leave an empty cell.
 */
export function DetailList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <dl className={cn("divide-y rounded-xl border bg-card px-5 text-sm", className)}>{children}</dl>
}

export function DetailRow({ label, value, mono, strong }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      {/* Long labels (a priced line) wrap; mono values (prices, numbers, codes) never break. */}
      <dt className={cn("text-muted-foreground", mono ? "min-w-0" : "shrink-0")}>{label}</dt>
      <dd className={cn("text-right", mono ? "shrink-0 font-mono whitespace-nowrap tabular" : "min-w-0 break-words", strong && "font-semibold")}>{value}</dd>
    </div>
  )
}
