"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowSquareOutIcon, CaretUpDownIcon, SignOutIcon, SpinnerIcon } from "@phosphor-icons/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { signOut } from "@/app/portal/actions"
import type { UserRole } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = { name: string; email: string; role: UserRole }

const roleLabel: Record<UserRole, string> = { admin: "Owner", agent: "Agent", dealer: "Dealer" }

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0]
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

function Avatar({ name, email, className }: Props & { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold text-brand-ink",
        className
      )}
    >
      {initials(name, email)}
    </span>
  )
}

function Identity(props: Props) {
  return (
    <span className="grid min-w-0 flex-1 text-left leading-tight">
      <span className="truncate text-sm font-medium">{props.name || props.email.split("@")[0]}</span>
      <span className="truncate text-xs text-muted-foreground">{props.email}</span>
    </span>
  )
}

/** Sidebar footer: who is signed in, and the account actions behind one menu. */
export function NavUser(props: Props) {
  const { isMobile, state } = useSidebar()
  const [pending, startTransition] = React.useTransition()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={state === "collapsed" ? `${props.name || props.email} (account)` : undefined}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar {...props} />
            <Identity {...props} />
            <CaretUpDownIcon className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
            className="w-(--anchor-width) min-w-64"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 text-foreground">
                <Avatar {...props} className="size-9" />
                <span className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{props.name || props.email.split("@")[0]}</span>
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                      {roleLabel[props.role]}
                    </span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground" title={props.email}>
                    {props.email}
                  </span>
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/" target="_blank" rel="noopener" />}>
              <ArrowSquareOutIcon className="text-muted-foreground" />
              View website
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              closeOnClick={false}
              onClick={() => startTransition(() => signOut())}
            >
              {pending ? <SpinnerIcon className="animate-spin" /> : <SignOutIcon />}
              {pending ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function NavUserSkeleton() {
  return (
    <div aria-hidden className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:px-0">
      <span className="size-8 shrink-0 animate-pulse rounded-md bg-sidebar-accent" />
      <span className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
        <span className="h-3 w-24 animate-pulse rounded bg-sidebar-accent" />
        <span className="h-2.5 w-36 animate-pulse rounded bg-sidebar-accent" />
      </span>
    </div>
  )
}
