"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserCircleIcon } from "@phosphor-icons/react"

import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isCurrent, navLinks } from "@/components/site/nav-links"
import { cn } from "@/lib/utils"

const linkClass =
  "relative inline-flex h-10 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none " +
  // Current page: a 2px plum bar that sits on the header's bottom hairline.
  "after:absolute after:inset-x-3 after:-bottom-[12px] after:h-0.5 after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100"

/** Desktop links with the current section marked. Reads the URL, so it renders inside Suspense. */
export function HeaderNavLinks() {
  const pathname = usePathname()
  return navLinks.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
      className={linkClass}
    >
      {link.label}
    </Link>
  ))
}

/** Same links before the URL is known (prerender); no current marker. */
export function HeaderNavLinksStatic() {
  return navLinks.map((link) => (
    <Link key={link.href} href={link.href} className={linkClass}>
      {link.label}
    </Link>
  ))
}

/** Shared login for admin, agents and dealers, as an icon with a named tooltip. */
export function PortalLoginIcon() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/portal/login"
            aria-label="Portal Login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-lg" }),
              "size-11 text-muted-foreground hover:text-foreground"
            )}
          >
            <UserCircleIcon weight="bold" className="size-[22px]" />
          </Link>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        Portal Login
      </TooltipContent>
    </Tooltip>
  )
}
