"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CellTowerIcon, PlusSquareIcon, SquaresFourIcon, TagIcon, type Icon } from "@phosphor-icons/react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Wordmark } from "@/components/site/wordmark"

type NavItem = { href: string; label: string; Icon: Icon; exact?: boolean }

const overview: NavItem = { href: "/admin", label: "Overview", Icon: SquaresFourIcon, exact: true }
const catalogue: NavItem[] = [
  { href: "/admin/carriers", label: "Carriers", Icon: CellTowerIcon },
  { href: "/admin/plans", label: "Plans", Icon: TagIcon },
  { href: "/admin/addons", label: "Add-ons", Icon: PlusSquareIcon },
]

export function AdminSidebar({ footer }: { footer: React.ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center px-3 group-data-[collapsible=icon]:px-2">
        <Wordmark href="/admin" className="items-start group-data-[collapsible=icon]:hidden" />
        <Link
          href="/admin"
          aria-label="MultiSims USA admin"
          className="hidden size-8 items-center justify-center rounded-md bg-primary font-logo text-[11px] font-extrabold tracking-wide text-primary-foreground group-data-[collapsible=icon]:flex"
        >
          MSU
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Pathname is request data: links render first, the active state streams in. */}
        <React.Suspense fallback={<Nav pathname={null} />}>
          <ActiveNav />
        </React.Suspense>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function ActiveNav() {
  return <Nav pathname={usePathname()} />
}

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavLink item={overview} pathname={pathname} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Catalogue</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {catalogue.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const active = pathname !== null && (item.exact ? pathname === item.href : pathname.startsWith(item.href))
  const { Icon } = item
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => isMobile && setOpenMobile(false)}
          />
        }
      >
        <Icon weight={active ? "fill" : "regular"} />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
