import { CoinsIcon, HandCoinsIcon, LockSimpleIcon, WalletIcon } from "@phosphor-icons/react/ssr"

import { StatGrid } from "@/components/patterns/stat-grid"
import type { Wallet } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"

/**
 * A dealer's money as four KPI tiles: what they can spend now, what is theirs, what is
 * held for orders being filled, and any credit the owner allows.
 */
export function WalletSummary({ wallet, className }: { wallet: Wallet; className?: string }) {
  return (
    <StatGrid
      className={className}
      stats={[
        { label: "Available to spend", icon: WalletIcon, value: formatPrice(wallet.available_cents), sub: "Balance, less what is held, plus any credit" },
        { label: "Balance", icon: CoinsIcon, value: formatPrice(wallet.balance_cents), sub: "Paid in, less SIMs delivered" },
        { label: "Held for orders", icon: LockSimpleIcon, value: formatPrice(wallet.reserved_cents), sub: "Taken as each SIM is delivered" },
        {
          label: "Credit allowed",
          icon: HandCoinsIcon,
          value: wallet.credit_limit_cents ? formatPrice(wallet.credit_limit_cents) : "None",
          sub: wallet.credit_limit_cents ? "How far below zero you may order" : "Orders are paid from your balance",
        },
      ]}
    />
  )
}
