import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr"

import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { buttonVariants } from "@/components/ui/button"
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { NavUserSkeleton } from "@/components/admin/nav-user"
import { SidebarFooter } from "@/components/admin/sidebar-footer"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"
import { requireRole } from "@/lib/auth"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | MultiSims USA" },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar
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
          <Wordmark href="/admin" className="md:hidden" />
          <div className="hidden min-w-0 md:block">
            <Suspense fallback={<span className="text-sm font-medium">Overview</span>}>
              <AdminBreadcrumbs />
            </Suspense>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/"
              target="_blank"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 text-muted-foreground hover:text-foreground max-sm:hidden")}
            >
              View website
              <ArrowSquareOutIcon data-icon="inline-end" />
            </Link>
            <ThemeToggle tooltip />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Suspense fallback={<AdminPageSkeleton />}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireRole("admin")
  return children
}

function AdminPageSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}
