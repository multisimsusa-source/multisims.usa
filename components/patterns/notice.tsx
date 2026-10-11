import { CheckCircleIcon, InfoIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"

type Tone = "info" | "success" | "warning" | "danger"

const tones: Record<Tone, string> = {
  info: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
}

const icons = { info: InfoIcon, success: CheckCircleIcon, warning: WarningIcon, danger: WarningCircleIcon }

/**
 * An inline message on a soft tint: form errors, confirmations, instructions, warnings.
 * Never a coloured side border. `role` defaults to "alert" for danger and "status"
 * for the rest, so screen readers announce it when it appears.
 */
export function Notice({
  tone = "info",
  title,
  icon = true,
  className,
  children,
}: {
  tone?: Tone
  title?: React.ReactNode
  /** Show the tone's icon. Short single-line errors usually read better without. */
  icon?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const Icon = icons[tone]
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg px-4 py-3 text-sm", tones[tone], className)}>
      {icon ? <Icon weight={tone === "success" ? "fill" : "regular"} className="mt-0.5 size-4 shrink-0" /> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  )
}
