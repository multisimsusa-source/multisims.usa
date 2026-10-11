import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { DownloadSimpleIcon } from "@phosphor-icons/react/ssr"

import { EmptyState } from "@/components/patterns/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { UrlFilters } from "@/components/staff/url-filters"
import { formatPrice } from "@/lib/format"
import { formatDateTime } from "@/lib/orders"
import { listCustomers } from "@/lib/staff/customers"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Customers" }

export default function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="Everyone who ordered on the website, one row per email. The export is for your own records; this site never sends marketing email."
        actions={
          <Link href="/admin/customers/export" prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
            <DownloadSimpleIcon data-icon="inline-start" />
            Export CSV
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: Pick<PageProps<"/admin/customers">, "searchParams">) {
  const params = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const q = params.q ?? ""
  const customers = await listCustomers(q, 500)

  return (
    <>
      <UrlFilters query={q} placeholder="Name, email or phone" params={params} />
      {customers.length ? (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="pr-4 text-right">Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.email}>
                  <TableCell className="max-w-64 pl-4">
                    <Link href={`/admin/orders?q=${encodeURIComponent(c.email)}`} className="block truncate font-medium hover:underline">
                      {c.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm tabular">{c.phone}</TableCell>
                  <TableCell className="text-right font-mono tabular">{c.orders}</TableCell>
                  <TableCell className="text-right font-mono tabular">{formatPrice(c.spent_cents)}</TableCell>
                  <TableCell className="pr-4 text-right text-sm whitespace-nowrap text-muted-foreground">{formatDateTime(c.last_order_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title={q ? "No customer matches that search" : "No customers yet"}>
          {q ? "Try part of the email or phone number." : "Everyone who orders on the website appears here."}
        </EmptyState>
      )}
    </>
  )
}
