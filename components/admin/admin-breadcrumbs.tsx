"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CaretRightIcon } from "@phosphor-icons/react"

const ROOTS: Record<string, string> = { admin: "Overview", agent: "Queue", dealer: "Overview" }

const LABELS: Record<string, string> = {
  carriers: "Carriers",
  plans: "Plans",
  addons: "Add-ons",
  new: "New plan",
  orders: "Orders",
  tickets: "Tickets",
  activations: "Activations",
  customers: "Customers",
  agents: "Agents",
  dealers: "Dealers",
  discounts: "Discounts",
  reviews: "Reviews",
  reports: "Reports",
  settings: "Settings",
  design: "Design system",
  wallet: "Wallet",
  account: "Login",
}

/** Labels that differ in the dealer portal. */
const DEALER_LABELS: Record<string, string> = { new: "New order" }

/** An id segment is labelled by its section: /orders/<id> is "Order", /plans/<id> "Edit plan". */
const DETAIL: Record<string, string> = { plans: "Edit plan", orders: "Order", tickets: "Ticket", dealers: "Dealer" }

/** Where you are in the portal. The page title carries the record's own name. */
export function AdminBreadcrumbs() {
  const [root = "admin", ...parts] = usePathname().split("/").filter(Boolean)
  const crumbs = [
    { href: `/${root}`, label: ROOTS[root] ?? "Overview" },
    ...parts.map((part, i) => ({
      href: `/${root}/${parts.slice(0, i + 1).join("/")}`,
      label: (root === "dealer" ? DEALER_LABELS[part] : undefined) ?? LABELS[part] ?? DETAIL[parts[i - 1] ?? ""] ?? "Details",
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
