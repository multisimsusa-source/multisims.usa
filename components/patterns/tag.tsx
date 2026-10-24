import type { Tone } from "@/lib/orders"
import { cn } from "@/lib/utils"

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
}

/** Small uppercase status pill on a pastel tint. Words always carry the meaning, not colour alone. */
export function Tag({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium tracking-[0.03em] whitespace-nowrap uppercase [&_svg]:size-3.5",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
