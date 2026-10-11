import { cn } from "@/lib/utils"

/**
 * Phones only: holds a flow's finishing action at the bottom of the screen.
 *
 * - `mode="sticky"` (default) sticks while its parent is on screen and parks at the
 *   parent's end, so it never covers the footer. Place it as the last child of the form.
 * - `mode="fixed"` stays on screen; the page must add bottom padding (`max-sm:pb-28`).
 *
 * Hidden from `breakpoint` up, where the action lives in the normal layout.
 */
export function ActionBar({
  mode = "sticky",
  breakpoint = "lg",
  className,
  children,
}: {
  mode?: "sticky" | "fixed"
  breakpoint?: "sm" | "lg"
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur",
        mode === "sticky" ? "sticky bottom-0 -mx-4 sm:-mx-6 sm:px-6" : "fixed inset-x-0 bottom-0",
        breakpoint === "lg" ? "lg:hidden" : "sm:hidden",
        className
      )}
    >
      <div className="mx-auto flex max-w-xl items-center gap-4">{children}</div>
    </div>
  )
}
