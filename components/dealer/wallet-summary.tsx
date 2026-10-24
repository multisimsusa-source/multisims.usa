import type { Wallet } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * A dealer's money in four figures on a hairline grid: what they can spend now, what is
 * theirs, what is held for orders being filled, and any credit the owner allows.
 */
export function WalletSummary({ wallet, className }: { wallet: Wallet; className?: string }) {
  const cells = [
    { label: "Available to spend", value: wallet.available_cents, strong: true },
    { label: "Balance", value: wallet.balance_cents },
    { label: "Held for orders", value: wallet.reserved_cents },
    { label: "Credit allowed", value: wallet.credit_limit_cents, empty: wallet.credit_limit_cents === 0 ? "None" : null },
  ]
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4", className)}>
      {cells.map((c) => (
        <div key={c.label} className="bg-background p-4 sm:p-5">
          <dt className="text-sm text-muted-foreground">{c.label}</dt>
          <dd className={cn("mt-1 font-mono tabular", c.strong ? "text-2xl font-semibold" : "text-xl")}>{c.empty ?? formatPrice(c.value)}</dd>
        </div>
      ))}
    </dl>
  )
}
