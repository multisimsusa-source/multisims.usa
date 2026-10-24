import Link from "next/link"

import { Tag } from "@/components/patterns/tag"
import { batchProgress, type Batch } from "@/lib/dealer-orders"
import { batchLabel } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { customerStatusTone, formatDateTime } from "@/lib/orders"

/**
 * A dealer's bulk orders, newest first. Each row is one click target: number and date,
 * what is in it, how many SIMs are live, and the total taken from the wallet.
 */
export function BatchList({ batches, base = "/dealer/orders" }: { batches: Batch[]; base?: string }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {batches.map((b) => {
        const progress = batchProgress(b.orders)
        const lines = b.orders.filter((o) => !o.replacement_of)
        return (
          <li key={b.id} className="relative flex flex-col gap-2 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <Link href={`${base}/${b.id}`} className="font-mono font-medium tabular after:absolute after:inset-0 hover:underline">
                  {batchLabel(b.number)}
                </Link>
                <Tag tone={customerStatusTone[progress.status]}>{progress.status}</Tag>
                {b.reference ? <span className="truncate text-sm text-muted-foreground">{b.reference}</span> : null}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {lines.length === 1 ? `${lines[0].carrier_name} ${lines[0].plan_name}` : `${lines.length} plans`} &middot;{" "}
                <span className="tabular">{formatDateTime(b.created_at)}</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground sm:w-40 sm:text-right">
              <span className="font-mono text-foreground tabular">{progress.delivered}</span> of{" "}
              <span className="font-mono tabular">{progress.total}</span> SIMs live
            </p>
            <p className="font-mono font-medium tabular sm:w-28 sm:text-right">{formatPrice(b.total_cents)}</p>
          </li>
        )
      })}
    </ul>
  )
}
