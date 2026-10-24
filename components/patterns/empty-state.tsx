import { cn } from "@/lib/utils"

/**
 * What a list shows when it has nothing: a short sentence saying why and, when there
 * is one, the next step. Filtered-empty and truly-empty get different words.
 * With an icon it draws the empty illustration: the screen's icon in a plum chip in
 * front of two blank hairline cards, all from tokens, so it follows light and dark.
 */
export function EmptyState({
  title,
  icon,
  action,
  className,
  children,
}: {
  title?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border bg-background px-6 py-12 text-center text-sm", className)}>
      {icon ? <EmptyArt icon={icon} className="mb-3" /> : null}
      {title ? <p className="text-base font-semibold text-foreground">{title}</p> : null}
      {children ? <div className="max-w-[48ch] text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

/** The empty illustration on its own, for panels that lay out their own empty copy. */
export function EmptyArt({ icon, className }: { icon: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-24 w-36", className)}>
      <BlankCard className="top-1 left-2 -rotate-6" />
      <BlankCard className="top-3 right-2 rotate-[5deg]" />
      <span className="absolute bottom-0 left-1/2 inline-flex size-12 -translate-x-1/2 items-center justify-center rounded-xl bg-brand-soft text-brand-ink ring-4 ring-background [&_svg]:size-6">
        {icon}
      </span>
      <span className="absolute top-0 right-6 size-2 rounded-full bg-copper" />
    </div>
  )
}

function BlankCard({ className }: { className?: string }) {
  return (
    <span className={cn("absolute flex h-16 w-24 flex-col gap-1.5 rounded-lg border bg-card p-2.5", className)}>
      <span className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
      <span className="h-1.5 w-16 rounded-full bg-muted" />
      <span className="h-1.5 w-12 rounded-full bg-muted" />
    </span>
  )
}
