import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowRightIcon, ArrowsClockwiseIcon, CheckCircleIcon, WarningIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { ProductBadge } from "@/components/site/product-mark"
import { Tag } from "@/components/patterns/tag"
import { Age } from "@/components/staff/age"
import { ClaimButton } from "@/components/staff/order-actions"
import { getSessionProfile } from "@/lib/auth"
import { formatDays } from "@/lib/format"
import { orderLabel } from "@/lib/orders"
import { getSettings, listOpenOrders, type QueueOrder } from "@/lib/staff/queries"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Queue" }

export default function QueuePage() {
  return (
    <>
      <AdminPageHeader
        title="Queue"
        description="Paid orders waiting for a line, oldest first. Claim one to work on it; nobody else can take it while it is yours."
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Queue />
      </Suspense>
    </>
  )
}

async function Queue() {
  const [profile, orders, settings] = await Promise.all([getSessionProfile(), listOpenOrders(), getSettings()])
  const me = profile?.id
  const isAdmin = profile?.role === "admin"
  const warn = settings.unclaimed_alert_minutes

  const waiting = orders.filter((o) => o.status === "queued")
  const mine = orders.filter((o) => o.claimed_by === me && (o.status === "claimed" || o.status === "needs_attention"))
  const others = orders.filter((o) => o.claimed_by !== me && o.status === "claimed")
  const flagged = orders.filter((o) => o.claimed_by !== me && o.status === "needs_attention")
  const held = orders.filter((o) => o.status === "awaiting_approval")

  return (
    <div className="flex flex-col gap-8">
      {mine.length ? (
        <Group title="Yours" count={mine.length}>
          {mine.map((o) => (
            <Row key={o.id} order={o} warn={warn} href={`/agent/orders/${o.id}`} action={<OpenLink id={o.id} label="Continue" />} />
          ))}
        </Group>
      ) : null}

      <Group title="Waiting" count={waiting.length}>
        {waiting.length ? (
          waiting.map((o) => <Row key={o.id} order={o} warn={warn} href={isAdmin ? `/admin/orders/${o.id}` : undefined} action={<ClaimButton orderId={o.id} className="h-10 w-full sm:w-24" />} />)
        ) : (
          <li className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-success-ink" />
            Nothing waiting. New orders appear here and ring when sound is on.
          </li>
        )}
      </Group>

      {flagged.length ? (
        <Group title="Needs the owner" count={flagged.length}>
          {flagged.map((o) => (
            <Row key={o.id} order={o} warn={warn} href={isAdmin ? `/admin/orders/${o.id}` : undefined} action={isAdmin ? <OpenLink id={o.id} admin label="Decide" primary /> : <Holder order={o} />} />
          ))}
        </Group>
      ) : null}

      {others.length ? (
        <Group title="With other agents" count={others.length}>
          {others.map((o) => (
            <Row key={o.id} order={o} warn={warn} href={isAdmin ? `/admin/orders/${o.id}` : undefined} action={isAdmin ? <OpenLink id={o.id} admin label="Open" /> : <Holder order={o} />} />
          ))}
        </Group>
      ) : null}

      {isAdmin && held.length ? (
        <Group title="Replacements waiting for your approval" count={held.length}>
          {held.map((o) => (
            <Row key={o.id} order={o} warn={warn} href={`/admin/orders/${o.id}`} action={<OpenLink id={o.id} admin label="Review" primary />} />
          ))}
        </Group>
      ) : null}
    </div>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
        {title}
        <span className="rounded-full bg-muted px-2 font-mono text-xs font-medium text-muted-foreground tabular">{count}</span>
      </h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-background">{children}</ul>
    </section>
  )
}

function Row({ order, warn, action, href }: { order: QueueOrder; warn: number; action: React.ReactNode; href?: string }) {
  const since = order.paid_at ?? order.created_at
  const facts = [
    `${order.quantity} x`,
    formatDays(order.days),
    order.addon_name,
    order.zip_code ? `ZIP ${order.zip_code}` : null,
    order.area_code ? `Area ${order.area_code}` : null,
  ].filter(Boolean)

  return (
    <li className={cn("relative flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:gap-4", href && "hover:bg-muted/40")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {href ? (
            <Link href={href} className="font-mono text-sm font-medium tabular outline-none after:absolute after:inset-0 focus-visible:underline">
              {orderLabel(order)}
            </Link>
          ) : (
            <span className="font-mono text-sm font-medium tabular">{orderLabel(order)}</span>
          )}
          <Age since={since} warnAfterMin={order.status === "queued" ? warn : undefined} className="text-xs" />
          {order.replacement_of ? (
            <Tag tone="warning">
              <ArrowsClockwiseIcon className="mr-1 size-3" />
              Replacement
            </Tag>
          ) : null}
          {order.status === "needs_attention" ? <Tag tone="danger">Needs attention</Tag> : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 font-medium">
          {order.carrier_name} {order.plan_name}
          <ProductBadge type={order.product_type} />
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{facts.join(" · ")}</p>
        {order.status === "needs_attention" && order.attention_reason ? (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-danger-ink">
            <WarningIcon className="mt-0.5 size-4 shrink-0" />
            {order.attention_reason}
          </p>
        ) : null}
        {order.staff_note && order.status === "claimed" ? (
          <p className="mt-2 text-sm">
            <span className="font-medium">Owner:</span> {order.staff_note}
          </p>
        ) : null}
      </div>
      <div className="relative z-10 shrink-0 sm:text-right">{action}</div>
    </li>
  )
}

function Holder({ order }: { order: QueueOrder }) {
  return <span className="text-sm text-muted-foreground">{order.claimer?.full_name || order.claimer?.email || "Another agent"}</span>
}

function OpenLink({ id, label, primary, admin }: { id: string; label: string; primary?: boolean; admin?: boolean }) {
  return (
    <Link
      href={admin ? `/admin/orders/${id}` : `/agent/orders/${id}`}
      className={cn(buttonVariants({ variant: primary ? "default" : "outline", size: "lg" }), "h-10 w-full bg-background sm:w-auto", primary && "bg-primary")}
    >
      {label}
      <ArrowRightIcon data-icon="inline-end" />
    </Link>
  )
}
