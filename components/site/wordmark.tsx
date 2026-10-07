import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * The client's logo lockup: "MSU" monogram in plum over "MULTISIMS.USA" in copper.
 * Typeset recreation; swap for the original vector in public/brand/ once supplied.
 */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="MultiSims USA home"
      className={cn(
        "inline-flex min-h-11 flex-col items-center justify-center rounded-md px-0.5 leading-none outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        className
      )}
    >
      <span
        aria-hidden
        className="font-logo text-[1.7rem] font-extrabold tracking-[0.06em] text-brand [font-variation-settings:'opsz'_24]"
      >
        MSU
      </span>
      <span aria-hidden className="mt-1 font-logo text-[0.5rem] font-medium tracking-[0.32em] text-copper uppercase">
        Multisims.usa
      </span>
    </Link>
  )
}
