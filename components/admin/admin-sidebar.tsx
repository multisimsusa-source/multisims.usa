"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AddressBookIcon,
  CellTowerIcon,
  ChartBarIcon,
  GearSixIcon,
  LifebuoyIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PercentIcon,
  PlusSquareIcon,
  ReceiptIcon,
  SquaresFourIcon,
  StarIcon,
  StorefrontIcon,
  TagIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WalletIcon,
  type Icon,
} from "@phosphor-icons/react"

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
type NavGroup = { label?: string; items: NavItem[] }
export type PortalVariant = "admin" | "agent" | "dealer"

const navs: Record<PortalVariant, { home: string; label: string; groups: NavGroup[] }> = {
  admin: {
    home: "/admin",
    label: "MultiSims USA admin",
    groups: [
      {
        items: [
          { href: "/admin", label: "Overview", Icon: SquaresFourIcon, exact: true },
          { href: "/admin/reports", label: "Reports", Icon: ChartBarIcon },
        ],
      },
      {
        label: "Orders",
        items: [
          { href: "/admin/orders", label: "Orders", Icon: ReceiptIcon },
          { href: "/agent", label: "Agent queue", Icon: ListChecksIcon, exact: true },
          { href: "/admin/tickets", label: "Tickets", Icon: LifebuoyIcon },
          { href: "/admin/activations", label: "Activations", Icon: MagnifyingGlassIcon },
          { href: "/admin/customers", label: "Customers", Icon: AddressBookIcon },
          { href: "/admin/reviews", label: "Reviews", Icon: StarIcon },
        ],
      },
      {
        label: "Catalogue",
        items: [
          { href: "/admin/carriers", label: "Carriers", Icon: CellTowerIcon },
          { href: "/admin/plans", label: "Plans", Icon: TagIcon },
          { href: "/admin/addons", label: "Add-ons", Icon: PlusSquareIcon },
          { href: "/admin/discounts", label: "Discounts", Icon: PercentIcon },
        ],
      },
      {
        label: "Team",
        items: [
          { href: "/admin/agents", label: "Agents", Icon: UsersThreeIcon },
          { href: "/admin/dealers", label: "Dealers", Icon: StorefrontIcon },
          { href: "/admin/settings", label: "Settings", Icon: GearSixIcon },
        ],
      },
    ],
  },
  agent: {
    home: "/agent",
    label: "MultiSims USA agent portal",
    groups: [
      {
        items: [
          { href: "/agent", label: "Queue", Icon: ListChecksIcon, exact: true },
          { href: "/agent/orders", label: "Orders", Icon: ReceiptIcon },
          { href: "/agent/tickets", label: "Tickets", Icon: LifebuoyIcon },
        ],
      },
    ],
  },
  dealer: {
    home: "/dealer",
    label: "MultiSims USA dealer portal",
    groups: [
      {
        items: [
          { href: "/dealer", label: "Overview", Icon: SquaresFourIcon, exact: true },
          { href: "/dealer/new", label: "New order", Icon: PlusSquareIcon },
          { href: "/dealer/orders", label: "Orders", Icon: ReceiptIcon },
          { href: "/dealer/activations", label: "Activations", Icon: MagnifyingGlassIcon },
          { href: "/dealer/tickets", label: "Tickets", Icon: LifebuoyIcon },
        ],
      },
      {
        label: "Account",
        items: [
          { href: "/dealer/wallet", label: "Wallet", Icon: WalletIcon },
          { href: "/dealer/account", label: "Login", Icon: UserCircleIcon },
        ],
      },
    ],
  },
}

export function AdminSidebar({ footer, variant = "admin" }: { footer: React.ReactNode; variant?: PortalVariant }) {
  const nav = navs[variant]
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center px-3 group-data-[collapsible=icon]:px-2">
        <Wordmark href={nav.home} className="items-start group-data-[collapsible=icon]:hidden" />
        <Link
          href={nav.home}
          aria-label={nav.label}
          className="hidden size-8 items-center justify-center rounded-md bg-primary font-logo text-[11px] font-extrabold tracking-wide text-primary-foreground group-data-[collapsible=icon]:flex"
        >
          MSU
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Pathname is request data: links render first, the active state streams in. */}
        <React.Suspense fallback={<Nav groups={nav.groups} pathname={null} />}>
          <ActiveNav groups={nav.groups} />
        </React.Suspense>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function ActiveNav({ groups }: { groups: NavGroup[] }) {
  return <Nav groups={groups} pathname={usePathname()} />
}

function Nav({ groups, pathname }: { groups: NavGroup[]; pathname: string | null }) {
  return (
    <>
      {groups.map((group, i) => (
        <SidebarGroup key={group.label ?? i}>
          {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
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
