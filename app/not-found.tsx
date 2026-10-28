import Link from "next/link"

import { NotFoundContent } from "@/components/site/not-found-content"
import { Wordmark } from "@/components/site/wordmark"

const links = [
  { href: "/", label: "Home" },
  { href: "/plans", label: "Plans" },
  { href: "/refill", label: "Refill" },
  { href: "/contact", label: "Contact us" },
]

/**
 * An address that matches no page, or a plan or order that is gone. A plain bar with the
 * logo and the main links, so there is always a way on. Static on purpose: the full site
 * header here would not match its server render while a hidden plan's page is refreshed.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main id="main" className="flex-1">
        <NotFoundContent />
      </main>
      <footer className="border-t">
        <nav aria-label="Main pages" className="mx-auto flex max-w-6xl flex-wrap gap-x-6 px-4 py-6 sm:px-6">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  )
}
