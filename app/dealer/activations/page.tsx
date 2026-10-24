import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { DownloadSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { CopyButton } from "@/components/patterns/copy-button"
import { EmptyState } from "@/components/patterns/empty-state"
import { Tag } from "@/components/patterns/tag"
import { UrlFilters } from "@/components/staff/url-filters"
import { requireRole } from "@/lib/auth"
import { listDealerActivations } from "@/lib/dealer-activations"
import { batchLabel } from "@/lib/dealers"
import { formatDays, productTypeLabel } from "@/lib/format"
import { customerItemStatus, customerStatusTone, formatDateTime } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Activations" }

export default function DealerActivationsPage({ searchParams }: PageProps<"/dealer/activations">) {
  return (
    <>
      <AdminPageHeader
        title="Activations"
        description="Every line you have received. Search by phone number, ICCID, tracking number or order number."
        actions={
          <a href="/dealer/activations/export" download className={buttonVariants({ variant: "outline", size: "lg" })}>
            <DownloadSimpleIcon data-icon="inline-start" />
            Download CSV
          </a>
        }
      />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: Pick<PageProps<"/dealer/activations">, "searchParams">) {
  const [profile, raw] = await Promise.all([requireRole("dealer"), searchParams])
  const params = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const q = (params.q ?? "").trim()
  const rows = await listDealerActivations(await createClient(), profile.id, q)

  return (
    <div className="flex flex-col gap-4">
      <UrlFilters query={q} placeholder="Phone, ICCID, tracking, B-1001" params={params} />
      {rows.length ? (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="tabular">{rows.length}</span> {rows.length === 1 ? "line" : "lines"}
            {rows.length >= 300 ? ", newest first. Search to find older ones." : ""}
          </p>
          <ul className="divide-y overflow-hidden rounded-xl border bg-background">
            {rows.map((r) => {
              const replaced = r.status === "replaced"
              const status = replaced ? null : customerItemStatus(r.order, r)
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                  <div className="min-w-0 sm:w-64">
                    <p className="truncate text-sm font-medium">
                      {r.order.carrier_name} {r.order.plan_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {productTypeLabel[r.order.product_type]} &middot; {formatDays(r.order.days)} &middot;{" "}
                      {r.order.batch ? (
                        <Link href={`/dealer/orders/${r.order.batch.id}`} className="font-mono text-brand tabular hover:underline">
                          {batchLabel(r.order.batch.number)}
                        </Link>
                      ) : null}
                    </p>
                  </div>
                  <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                    <Value label="Phone" value={r.phone_number} />
                    <Value label="ICCID" value={r.iccid} />
                  </dl>
                  <div className="flex items-center gap-3 sm:w-48 sm:justify-end">
                    <span className="text-sm text-muted-foreground tabular">{formatDateTime(r.fulfilled_at)}</span>
                    {replaced ? <Tag tone="neutral">Replaced</Tag> : status ? <Tag tone={customerStatusTone[status]}>{status}</Tag> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <EmptyState icon={<MagnifyingGlassIcon />} title={q ? "Nothing matches" : "No lines yet"}>
          {q ? "Check the number, or search by part of it." : "Lines show here as soon as they are delivered or posted."}
        </EmptyState>
      )}
    </div>
  )
}

function Value({ label, value, copy = true }: { label: string; value: string | null; copy?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-mono text-sm break-all tabular sm:break-normal sm:whitespace-nowrap">{value ?? <span className="font-sans text-muted-foreground">None</span>}</dd>
      </div>
      {value && copy ? <CopyButton value={value} label={`${label} ${value}`} className="size-8" /> : null}
    </div>
  )
}
