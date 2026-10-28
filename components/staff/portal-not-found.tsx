import Link from "next/link"
import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr"

import { EmptyArt } from "@/components/patterns/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A missing page inside a portal: an unknown id, or an order that belongs to someone else.
 * Stays in the portal (sidebar and all) and points back to the list it came from. Laid out
 * as an EmptyState, with a real page heading.
 */
export function PortalNotFound({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border bg-background px-6 py-12 text-center text-sm">
      <title>Page not found | MultiSims USA</title>
      <EmptyArt icon={<MagnifyingGlassIcon />} className="mb-3" />
      <h1 className="text-base font-semibold text-foreground">This page is not here</h1>
      <p className="max-w-[48ch] text-muted-foreground">It may have been removed, or it is not on your account.</p>
      <Link href={href} className={cn(buttonVariants({ size: "lg" }), "mt-3")}>
        {label}
      </Link>
    </div>
  )
}
