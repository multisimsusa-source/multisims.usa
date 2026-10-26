import { CoinsIcon, HandCoinsIcon, LockSimpleIcon, WalletIcon } from "@phosphor-icons/react/ssr"

import { StatGrid } from "@/components/patterns/stat-grid"
import type { Wallet } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"

/**
 * A dealer's money as four KPI tiles: what they can spend now, what is theirs, what is
 * held for orders and refills not delivered yet, and the credit limit.
 */
export function WalletSummary({ wallet, className }: { wallet: Wallet; className?: string }) {
  return (
    <StatGrid
      className={className}
      stats={[
        {
          label: "Available to spend",
          icon: WalletIcon,
          value: formatPrice(wallet.available_cents),
          sub: wallet.credit_limit_cents ? "Balance minus held, plus your credit limit" : "Balance minus held",
        },
        { label: "Balance", icon: CoinsIcon, value: formatPrice(wallet.balance_cents), sub: "Total money in your wallet" },
        {
          label: "Held for orders",
          icon: LockSimpleIcon,
          value: formatPrice(wallet.reserved_cents),
          sub: "Reserved for orders and refills not delivered yet. Taken as each SIM is delivered, and returned if cancelled.",
        },
        {
          label: "Credit limit",
          icon: HandCoinsIcon,
          value: formatPrice(wallet.credit_limit_cents),
          sub: "Extra amount you can spend beyond your balance (0 unless agreed)",
        },
      ]}
    />
  )
}
