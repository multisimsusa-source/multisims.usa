import { Suspense } from "react"
import Link from "next/link"
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs"
import {
  AdminSidebar,
  type PortalVariant,
} from "@/components/admin/admin-sidebar"
import { NavUserSkeleton } from "@/components/admin/nav-user"
import { NotificationCenter, type NotificationRow } from "@/components/admin/notification-center"
import { SidebarFooter } from "@/components/admin/sidebar-footer"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"
import { OrderAlerts } from "@/components/staff/order-alerts"
import { getSessionProfile } from "@/lib/auth"
import { getWallet } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const homes: Record<PortalVariant, { href: string; label: string }> = {
  admin: { href: "/admin", label: "Overview" },
  agent: { href: "/agent", label: "Queue" },
  dealer: { href: "/dealer", label: "Overview" },
}

/**
 * The admin, agent and dealer portals: sidebar, sticky bar, gated content. Staff get live
 * order alerts in the bar; dealers get their available balance.
 */
export function PortalShell({
  variant,
  gate,
  children,
}: {
  variant: PortalVariant
  /** Server component that redirects unless the viewer may see this portal. */
  gate: (props: { children: React.ReactNode }) => Promise<React.ReactNode>
  children: React.ReactNode
}) {
  const Gate = gate
  const home = homes[variant].href
  return (
    <SidebarProvider className="density-compact">
      <AdminSidebar
        variant={variant}
        footer={
          <Suspense fallback={<NavUserSkeleton />}>
            <SidebarFooter />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0 bg-canvas">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-5">
          <SidebarTrigger className="size-9" />
          <Separator orientation="vertical" className="mx-1 h-5 md:hidden" />
          <Wordmark href={home} className="max-[420px]:hidden md:hidden" />
          <div className="hidden min-w-0 md:block">
            <Suspense
              fallback={
                <span className="text-sm font-medium">
                  {homes[variant].label}
                </span>
              }
            >
              <AdminBreadcrumbs />
            </Suspense>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Suspense fallback={null}>
              {variant === "dealer" ? <DealerBalance /> : <Alerts />}
            </Suspense>
            <Link
              href="/"
              target="_blank"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-9 text-muted-foreground hover:text-foreground max-lg:hidden"
              )}
            >
              View website
              <ArrowSquareOutIcon data-icon="inline-end" />
            </Link>
            <Suspense fallback={null}>
              <Notifications />
            </Suspense>
            <ThemeToggle tooltip />
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          <Suspense fallback={<PortalPageSkeleton />}>
            <Gate>{children}</Gate>
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** Alerts mount only for staff; seeded with what is already queued so nothing old rings. */
async function Alerts() {
  const profile = await getSessionProfile()
  if (!profile || (profile.role !== "admin" && profile.role !== "agent"))
    return null
  const supabase = await createClient()
  const { data } = await supabase
    .from("orders")
    .select("id, phase")
    .eq("status", "queued")
    .limit(500)
  return (
    <OrderAlerts queuedKeys={(data ?? []).map((o) => `${o.id}:${o.phase}`)} />
  )
}

/** The dealer's spendable balance, always in view; links to the wallet. */
async function DealerBalance() {
  const profile = await getSessionProfile()
  if (!profile || profile.role !== "dealer") return null
  const wallet = await getWallet(await createClient(), profile.id)
  return (
    <Link
      href="/dealer/wallet"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "h-9 gap-2 text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="max-sm:sr-only">Available</span>
      <span className="tabular font-mono font-medium text-foreground">
        {formatPrice(wallet.available_cents)}
      </span>
    </Link>
  )
}

/** The bell: the signed-in person's latest notifications; it then listens for new ones. */
async function Notifications() {
  const profile = await getSessionProfile()
  if (!profile) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30)
  return <NotificationCenter userId={profile.id} initial={(data ?? []) as NotificationRow[]} toastOnArrival={profile.role === "dealer"} />
}

function PortalPageSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}
