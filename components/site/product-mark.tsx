import { QrCodeIcon, SimCardIcon } from "@phosphor-icons/react/ssr"

import type { ProductType } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Small filled tile with the SIM cut corner, marking eSIM vs SIM card. */
export function ProductMark({ type, className }: { type: ProductType; className?: string }) {
  const Icon = type === "esim" ? QrCodeIcon : SimCardIcon
  return (
    <span
      aria-hidden
      className={cn(
        "sim-cut inline-flex size-10 shrink-0 items-center justify-center rounded-md [--sim-cut:10px]",
        type === "esim" ? "bg-brand-soft text-brand-ink" : "bg-muted text-foreground",
        className
      )}
    >
      <Icon weight="bold" className="size-5" />
    </span>
  )
}

export function ProductBadge({ type }: { type: ProductType }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium tracking-[0.04em] uppercase",
        type === "esim" ? "bg-brand-soft text-brand-ink" : "bg-muted text-foreground/80"
      )}
    >
      {type === "esim" ? "eSIM" : "SIM card"}
    </span>
  )
}
