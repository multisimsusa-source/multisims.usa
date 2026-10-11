import { cn } from "@/lib/utils"

/**
 * What a list shows when it has nothing: a short sentence saying why and, when there
 * is one, the next step. Filtered-empty and truly-empty get different words.
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
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border bg-background px-6 py-10 text-center text-sm", className)}>
      {icon ? <span className="text-muted-foreground [&_svg]:size-6">{icon}</span> : null}
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      {children ? <div className="max-w-[48ch] text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
