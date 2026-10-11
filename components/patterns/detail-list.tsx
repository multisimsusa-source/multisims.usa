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
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right break-words", mono && "font-mono tabular", strong && "font-semibold")}>{value}</dd>
    </div>
  )
}
