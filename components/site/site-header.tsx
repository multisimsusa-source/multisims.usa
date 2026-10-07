import { Suspense } from "react"

import { HeaderNavLinks, HeaderNavLinksStatic, PortalLoginIcon } from "@/components/site/header-nav"
import { HeaderSearch } from "@/components/site/header-search"
import { MobileNav } from "@/components/site/mobile-nav"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Wordmark className="justify-self-start" />

        {/* Centred on the page, not between the logo and the icons. */}
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Suspense fallback={<HeaderNavLinksStatic />}>
            <HeaderNavLinks />
          </Suspense>
        </nav>

        <div className="flex items-center gap-0.5 justify-self-end">
          <Suspense fallback={<span aria-hidden className="size-11" />}>
            <HeaderSearch />
          </Suspense>
          <ThemeToggle tooltip className="size-11" />
          <PortalLoginIcon />
          <span aria-hidden className="mx-1 h-5 w-px bg-border md:hidden" />
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
