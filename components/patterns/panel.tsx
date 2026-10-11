import { cn } from "@/lib/utils"

/**
 * A bordered surface with a small uppercase label: the side-rail fact boxes of the
 * portals (Line to get, Customer, Record) and similar grouped facts.
 */
export function Panel({ title, action, className, children }: { title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-background p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="type-overline">{title}</h2>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

/** One label/value line inside a Panel: label left, value right-aligned. */
export function KeyValue({ label, value, mono, strong }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right break-words", mono && "font-mono tabular", strong && "font-semibold")}>{value}</span>
    </div>
  )
}
