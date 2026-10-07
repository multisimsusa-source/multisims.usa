"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRightIcon, ListIcon, UserCircleIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { isCurrent, navLinks } from "@/components/site/nav-links"

export function MobileNav() {
  const [open, setOpen] = React.useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-lg" className="size-11 md:hidden" aria-label="Open menu">
            <ListIcon weight="bold" className="size-5" />
          </Button>
        }
      />
      <SheetContent side="right" className="w-[min(20rem,85vw)] gap-0">
        <SheetHeader className="border-b">
          <SheetTitle className="font-heading text-base">Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col p-2">
          <React.Suspense fallback={<SheetLinks pathname="" onNavigate={close} />}>
            <CurrentSheetLinks onNavigate={close} />
          </React.Suspense>
        </nav>
        <div className="mt-auto border-t p-2">
          <Link
            href="/portal/login"
            onClick={close}
            className="flex min-h-14 items-center gap-3 rounded-md px-3 hover:bg-muted"
          >
            <UserCircleIcon weight="bold" aria-hidden className="size-6 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium">Portal Login</span>
              <span className="block text-sm text-muted-foreground">For admin, agents and dealers</span>
            </span>
            <ArrowRightIcon weight="bold" aria-hidden className="size-4 text-muted-foreground" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CurrentSheetLinks({ onNavigate }: { onNavigate: () => void }) {
  return <SheetLinks pathname={usePathname()} onNavigate={onNavigate} />
}

function SheetLinks({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return navLinks.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      onClick={onNavigate}
      aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
      className="flex min-h-12 items-center justify-between rounded-md px-3 text-base hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium"
    >
      {link.label}
      {isCurrent(pathname, link.href) ? (
        <span aria-hidden className="size-1.5 rounded-full bg-brand" />
      ) : null}
    </Link>
  ))
}
