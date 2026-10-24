"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BellIcon,
  BellSimpleSlashIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  ClockClockwiseIcon,
  LifebuoyIcon,
  PackageIcon,
  ReceiptIcon,
  StackIcon,
  TruckIcon,
  WalletIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { EmptyArt } from "@/components/patterns/empty-state"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { markNotificationsRead } from "@/app/portal/notification-actions"
import { elapsed } from "@/lib/orders"
import { createClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

export type NotificationRow = {
  id: number
  kind: string
  title: string
  body: string
  href: string | null
  read_at: string | null
  created_at: string
}

const icons: Record<string, { icon: Icon; tone: string }> = {
  order_new: { icon: ReceiptIcon, tone: "bg-brand-soft text-brand-ink" },
  order_activate: { icon: ClockClockwiseIcon, tone: "bg-brand-soft text-brand-ink" },
  order_replacement: { icon: PackageIcon, tone: "bg-warning-soft text-warning-ink" },
  order_flagged: { icon: WarningCircleIcon, tone: "bg-danger-soft text-danger-ink" },
  order_message: { icon: ChatCircleTextIcon, tone: "bg-warning-soft text-warning-ink" },
  batch_new: { icon: StackIcon, tone: "bg-brand-soft text-brand-ink" },
  ticket_new: { icon: LifebuoyIcon, tone: "bg-warning-soft text-warning-ink" },
  ticket_answered: { icon: LifebuoyIcon, tone: "bg-success-soft text-success-ink" },
  topup: { icon: WalletIcon, tone: "bg-success-soft text-success-ink" },
  funds_added: { icon: WalletIcon, tone: "bg-success-soft text-success-ink" },
  line_shipped: { icon: TruckIcon, tone: "bg-brand-soft text-brand-ink" },
  line_delivered: { icon: CheckCircleIcon, tone: "bg-success-soft text-success-ink" },
}

/**
 * The bell in the portal bar: unread count, the latest notifications for the signed-in
 * person, live as they arrive (Supabase Realtime, RLS keeps it to their own), mark as read.
 * Dealers also get a toast, since they have no order alerts.
 */
export function NotificationCenter({ userId, initial, toastOnArrival }: { userId: string; initial: NotificationRow[]; toastOnArrival?: boolean }) {
  const router = useRouter()
  const [items, setItems] = React.useState(initial)
  const [open, setOpen] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const unread = items.filter((n) => !n.read_at).length

  React.useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, (payload) => {
        const row = payload.new as NotificationRow
        setItems((list) => (list.some((n) => n.id === row.id) ? list : [row, ...list].slice(0, 30)))
        if (toastOnArrival) toast(row.title, { description: row.body || undefined })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, toastOnArrival])

  // Keep "4 min ago" honest while the panel is open.
  React.useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [open])

  const markAll = async () => {
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
    const result = await markNotificationsRead()
    if (!result.ok) toast.error(result.error)
  }

  const openItem = (n: NotificationRow) => {
    if (!n.read_at) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      void markNotificationsRead(n.id)
    }
    setOpen(false)
    if (n.href) router.push(n.href)
  }

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const groups = [
    { title: "Today", rows: items.filter((n) => new Date(n.created_at) >= startOfToday) },
    { title: "Earlier", rows: items.filter((n) => new Date(n.created_at) < startOfToday) },
  ].filter((g) => g.rows.length)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
            <BellIcon className="size-5" weight={unread ? "fill" : "regular"} />
            {unread ? (
              <span className="absolute top-1 right-1 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 font-mono text-[0.6875rem] leading-[1.125rem] font-semibold text-primary-foreground tabular-nums ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent className="w-[min(25rem,calc(100vw-1.5rem))]">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unread ? (
            <Button variant="ghost" size="sm" onClick={markAll} className="text-brand">
              Mark all as read
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">All caught up</span>
          )}
        </div>
        {items.length ? (
          <div className="max-h-[min(30rem,70dvh)] overflow-y-auto overscroll-contain">
            {groups.map((g) => (
              <section key={g.title} aria-label={g.title}>
                <p className="sticky top-0 z-10 bg-popover/95 px-4 pt-3 pb-1.5 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase backdrop-blur">{g.title}</p>
                <ul className="pb-1">
                  {g.rows.map((n) => {
                    const kind = icons[n.kind] ?? { icon: BellIcon, tone: "bg-muted text-foreground" }
                    const Glyph = kind.icon
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                            !n.read_at && "bg-brand-soft/35"
                          )}
                        >
                          <span aria-hidden className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg", kind.tone)}>
                            <Glyph className="size-4" weight="bold" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-sm leading-snug", n.read_at ? "font-medium" : "font-semibold")}>{n.title}</span>
                            {n.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span> : null}
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {ago(n.created_at, now)}
                              {!n.read_at ? <span className="sr-only">, unread</span> : null}
                            </span>
                          </span>
                          {!n.read_at ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
            <EmptyArt icon={<BellSimpleSlashIcon />} className="mb-2" />
            <p className="text-base font-semibold text-foreground">No notifications yet</p>
            <p>New orders, tickets and wallet changes show here as they happen.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** "Just now", "4 min ago", "2 h ago". */
function ago(at: string, now: number) {
  const text = elapsed(at, new Date(now))
  return text === "0 min" ? "Just now" : `${text} ago`
}
