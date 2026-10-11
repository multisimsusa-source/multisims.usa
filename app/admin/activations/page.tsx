import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"

import { EmptyState } from "@/components/patterns/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { ProductBadge } from "@/components/site/product-mark"
import { Tag } from "@/components/patterns/tag"
import { UrlFilters } from "@/components/staff/url-filters"
import { formatDays } from "@/lib/format"
import { formatDateTime, orderLabel } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import type { Order, OrderItem } from "@/lib/types"

export const metadata: Metadata = { title: "Activations" }

type Row = Pick<OrderItem, "id" | "seq" | "status" | "phone_number" | "iccid" | "tracking_number" | "fulfilled_at"> & {
  order: Pick<Order, "id" | "number" | "customer_name" | "customer_email" | "carrier_name" | "plan_name" | "product_type" | "days" | "replacement_of">
  agent: { full_name: string; email: string } | null
}

export default function ActivationsPage({ searchParams }: PageProps<"/admin/activations">) {
  return (
    <>
      <AdminPageHeader title="Activations" description="Every SIM delivered or shipped. Search by phone number, ICCID, order number or customer email." />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: Pick<PageProps<"/admin/activations">, "searchParams">) {
  const params = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const q = (params.q ?? "").trim()
  const supabase = await createClient()

  let query = supabase
    .from("order_items")
    .select(
      `id, seq, status, phone_number, iccid, tracking_number, fulfilled_at,
       order:orders!order_items_order_id_fkey!inner ( id, number, customer_name, customer_email, carrier_name, plan_name, product_type, days, replacement_of ),
       agent:profiles!order_items_fulfilled_by_fkey ( full_name, email )`
    )
    .in("status", ["fulfilled", "replaced"])
    .order("fulfilled_at", { ascending: false })
    .limit(200)

  if (q) {
    const number = q.match(/^(?:ms-?)?(\d{4,9})$/i)?.[1]
    const safe = q.replace(/[%,()*\\]/g, " ").slice(0, 80)
    if (number && number.length <= 6) query = query.eq("order.number", Number(number))
    else if (q.includes("@")) query = query.ilike("order.customer_email", `%${safe}%`)
    else query = query.or(`phone_number.ilike.%${safe}%,iccid.ilike.%${safe.replace(/\s/g, "")}%,tracking_number.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) throw error
  const rows = data as unknown as Row[]

  return (
    <>
      <UrlFilters query={q} placeholder="Phone number, ICCID, order number or email" params={params} />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Phone number</TableHead>
                <TableHead>ICCID</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="pr-4 text-right">Delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-mono tabular">
                    {r.phone_number ?? <span className="text-muted-foreground">Not recorded</span>}
                    {r.status === "replaced" ? <Tag tone="neutral" className="ml-2">Replaced</Tag> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">{r.iccid ?? r.tracking_number ?? ""}</TableCell>
                  <TableCell>
                    <Link href={`/admin/orders/${r.order.id}`} className="font-mono text-brand tabular hover:underline">
                      {orderLabel(r.order)}
                    </Link>
                    <span className="text-muted-foreground"> #{r.seq}</span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {r.order.carrier_name} {r.order.plan_name} <ProductBadge type={r.order.product_type} />
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDays(r.order.days)}</span>
                  </TableCell>
                  <TableCell className="max-w-52">
                    <span className="block truncate">{r.order.customer_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.order.customer_email}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.agent?.full_name || r.agent?.email || ""}</TableCell>
                  <TableCell className="pr-4 text-right text-sm whitespace-nowrap text-muted-foreground">{formatDateTime(r.fulfilled_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title={q ? "No activation matches that search" : "No SIMs delivered yet"}>
          {q ? "Search by phone number, ICCID, order number or customer email." : "Every SIM an agent delivers or ships is listed here."}
        </EmptyState>
      )}
      {rows.length === 200 ? <p className="mt-3 text-sm text-muted-foreground">Showing the latest 200. Search to find older ones.</p> : null}
    </>
  )
}
