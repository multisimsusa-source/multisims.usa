"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CaretRightIcon } from "@phosphor-icons/react"

const LABELS: Record<string, string> = {
  carriers: "Carriers",
  plans: "Plans",
  addons: "Add-ons",
  new: "New plan",
}

/** Where you are in the console. Plan ids show as "Edit plan"; the page title carries the name. */
export function AdminBreadcrumbs() {
  const parts = usePathname().split("/").filter(Boolean).slice(1)
  const crumbs = [
    { href: "/admin", label: "Overview" },
    ...parts.map((part, i) => ({
      href: `/admin/${parts.slice(0, i + 1).join("/")}`,
      label: LABELS[part] ?? "Edit plan",
    })),
  ]

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={c.href} className={`flex min-w-0 items-center gap-1.5 ${last ? "" : "max-sm:hidden"}`}>
              {i > 0 ? <CaretRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground max-sm:hidden" /> : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
