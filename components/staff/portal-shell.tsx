import { Suspense } from "react"
import Link from "next/link"
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs"
import { AdminSidebar, type PortalVariant } from "@/components/admin/admin-sidebar"
import { NavUserSkeleton } from "@/components/admin/nav-user"
import { SidebarFooter } from "@/components/admin/sidebar-footer"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"
import { OrderAlerts } from "@/components/staff/order-alerts"
import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

/** The admin and agent portals: sidebar, sticky bar with live order alerts, gated content. */
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
  const home = variant === "admin" ? "/admin" : "/agent"
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
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="size-9" />
          <Separator orientation="vertical" className="mx-1 h-5 md:hidden" />
          <Wordmark href={home} className="md:hidden max-[420px]:hidden" />
          <div className="hidden min-w-0 md:block">
            <Suspense fallback={<span className="text-sm font-medium">{variant === "admin" ? "Overview" : "Queue"}</span>}>
              <AdminBreadcrumbs />
            </Suspense>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Suspense fallback={null}>
              <Alerts />
            </Suspense>
            <Link
              href="/"
              target="_blank"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 text-muted-foreground hover:text-foreground max-lg:hidden")}
            >
              View website
              <ArrowSquareOutIcon data-icon="inline-end" />
            </Link>
            <ThemeToggle tooltip />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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
  if (!profile || (profile.role !== "admin" && profile.role !== "agent")) return null
  const supabase = await createClient()
  const { data } = await supabase.from("orders").select("id").eq("status", "queued").limit(500)
  return <OrderAlerts queuedIds={(data ?? []).map((o) => o.id)} />
}

function PortalPageSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}
