import Link from "next/link"
import { ArrowsClockwiseIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr"

import { EmptyState } from "@/components/patterns/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProductBadge } from "@/components/site/product-mark"
import { Tag } from "@/components/patterns/tag"
import { UrlFilters } from "@/components/staff/url-filters"
import { formatDays, formatPrice } from "@/lib/format"
import { formatDateTime, orderLabel, orderStatusLabel, orderStatusTone } from "@/lib/orders"
import { listOrders, listStaff, ORDERS_PAGE_SIZE, type OrderFilters } from "@/lib/staff/queries"
import type { OrderStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUSES: (OrderStatus | "open" | "all")[] = ["all", "open", "queued", "claimed", "needs_attention", "awaiting_approval", "awaiting_payment", "shipped", "fulfilled", "cancelled"]

/** Every order, newest first, filterable by status, product, agent and a search. */
export async function OrdersList({ searchParams, base, isAdmin }: { searchParams: Record<string, string | string[] | undefined>; base: "/admin" | "/agent"; isAdmin: boolean }) {
  const params = Object.fromEntries(Object.entries(searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const status = STATUSES.includes(params.status as OrderStatus) ? (params.status as OrderFilters["status"]) : "all"
  const type = params.type === "esim" || params.type === "physical" ? params.type : undefined
  const agent = /^[0-9a-f-]{36}$/.test(params.agent ?? "") ? params.agent : undefined
  const page = Math.max(1, Number(params.page) || 1)

  const [{ rows, total }, staff] = await Promise.all([
    listOrders({ status, q: params.q, type, agent, page }),
    isAdmin ? listStaff() : Promise.resolve([]),
  ])
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE))
  const pageHref = (p: number) => {
    const q = new URLSearchParams(params)
    if (p > 1) q.set("page", String(p))
    else q.delete("page")
    const s = q.toString()
    return `${base}/orders${s ? `?${s}` : ""}`
  }

  return (
    <>
      <UrlFilters
        query={params.q ?? ""}
        placeholder="Order number, name, email or phone"
        params={params}
        selects={[
          {
            param: "status",
            label: "Filter by status",
            value: status ?? "all",
            items: STATUSES.map((s) => ({ value: s, label: s === "all" ? "All statuses" : s === "open" ? "Open (not done)" : orderStatusLabel[s] })),
          },
          {
            param: "type",
            label: "Filter by product",
            value: type ?? "all",
            items: [
              { value: "all", label: "eSIM and SIM card" },
              { value: "esim", label: "eSIM" },
              { value: "physical", label: "SIM card" },
            ],
          },
          ...(isAdmin
            ? [
                {
                  param: "agent",
                  label: "Filter by agent",
                  value: agent ?? "all",
                  items: [{ value: "all", label: "Any agent" }, ...staff.map((s) => ({ value: s.id, label: s.full_name || s.email }))],
                },
              ]
            : []),
        ]}
      />

      <p className="mb-3 text-sm text-muted-foreground">
        {total === 0 ? "No orders match." : `${total} order${total === 1 ? "" : "s"}${pages > 1 ? `, page ${page} of ${pages}` : ""}`}
      </p>

      {rows.length ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-background md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agent</TableHead>
                  {isAdmin ? <TableHead className="text-right">Total</TableHead> : null}
                  <TableHead className="pr-4 text-right">Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`${base}/orders/${o.id}`} className="font-mono font-medium tabular after:absolute after:inset-0 hover:underline">
                        {orderLabel(o)}
                      </Link>
                      {o.replacement_of ? <ArrowsClockwiseIcon aria-label="Replacement" className="ml-1.5 inline size-3.5 text-warning-ink" /> : null}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="max-w-56 truncate">
                          {o.carrier_name} {o.plan_name}
                        </span>
                        <ProductBadge type={o.product_type} />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {o.quantity} x {formatDays(o.days)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-52">
                      <span className="block truncate">{o.customer_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.customer_email}</span>
                    </TableCell>
                    <TableCell>
                      <Tag tone={orderStatusTone[o.status]}>{orderStatusLabel[o.status]}</Tag>
                      {o.refunded_at ? <span className="ml-1.5 text-xs text-muted-foreground">Refunded</span> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.claimer?.full_name || o.claimer?.email || ""}</TableCell>
                    {isAdmin ? <TableCell className="text-right font-mono tabular">{formatPrice(o.total_cents)}</TableCell> : null}
                    <TableCell className="pr-4 text-right text-sm whitespace-nowrap text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y overflow-hidden rounded-xl border bg-background md:hidden">
            {rows.map((o) => (
              <li key={o.id} className="relative p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`${base}/orders/${o.id}`} className="font-mono font-medium tabular after:absolute after:inset-0">
                    {orderLabel(o)}
                  </Link>
                  <Tag tone={orderStatusTone[o.status]}>{orderStatusLabel[o.status]}</Tag>
                </div>
                <p className="mt-1 text-sm font-medium">
                  {o.quantity} x {o.carrier_name} {o.plan_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {o.customer_name}, {formatDateTime(o.created_at)}
                </p>
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2">
              <Link
                href={pageHref(page - 1)}
                aria-disabled={page <= 1}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10", page <= 1 && "pointer-events-none opacity-50")}
              >
                <CaretLeftIcon data-icon="inline-start" /> Newer
              </Link>
              <span className="font-mono text-sm text-muted-foreground tabular">
                {page} / {pages}
              </span>
              <Link
                href={pageHref(page + 1)}
                aria-disabled={page >= pages}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10", page >= pages && "pointer-events-none opacity-50")}
              >
                Older <CaretRightIcon data-icon="inline-end" />
              </Link>
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState title={params.q || status !== "all" || type || agent ? "Nothing matches these filters" : "No orders yet"}>
          {params.q || status !== "all" || type || agent ? "Clear a filter or search for part of a name, email or phone." : "Orders appear here as soon as customers check out."}
        </EmptyState>
      )}
    </>
  )
}
