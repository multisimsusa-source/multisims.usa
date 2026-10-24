import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftIcon, ArrowSquareOutIcon, DownloadSimpleIcon } from "@phosphor-icons/react/ssr"
import { z } from "zod"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { CopyButton } from "@/components/patterns/copy-button"
import { KeyValue, Panel } from "@/components/patterns/panel"
import { Tag } from "@/components/patterns/tag"
import { requireRole } from "@/lib/auth"
import { batchProgress, getBatch, listBatchItems, type BatchItem, type BatchOrder } from "@/lib/dealer-orders"
import { batchLabel, type LedgerEntry } from "@/lib/dealers"
import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import { customerItemStatus, customerOrderStatus, customerStatusTone, formatDateTime, orderLabel } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { cn } from "@/lib/utils"
import { LineSupport } from "@/components/dealer/line-support"
import { createDealerTicket } from "../../tickets/actions"
import { ActivateCardsButton } from "./activate-button"

export const metadata: Metadata = { title: "Order" }

const QR_URL_SECONDS = 60 * 60

export default function DealerBatchPage({ params }: PageProps<"/dealer/orders/[id]">) {
  return (
    <>
      <Link href="/dealer/orders" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon aria-hidden />
        Orders
      </Link>
      <Suspense fallback={<FormSkeleton sections={2} />}>
        <BatchDetail params={params} />
      </Suspense>
    </>
  )
}

async function BatchDetail({ params }: Pick<PageProps<"/dealer/orders/[id]">, "params">) {
  const [{ id }] = await Promise.all([params, requireRole("dealer")])
  if (!z.uuid().safeParse(id).success) notFound()

  // The session client only returns the dealer's own batch (RLS), so a found batch is theirs.
  const supabase = await createClient()
  const batch = await getBatch(supabase, id)
  if (!batch) notFound()

  const [items, { data: ledgerRows }, { data: ticketTypes }] = await Promise.all([
    listBatchItems(
      supabase,
      batch.orders.map((o) => o.id)
    ),
    supabase.from("wallet_ledger").select("kind, amount_cents").eq("batch_id", id),
    supabase.from("ticket_types").select("id, name").eq("active", true).order("display_order"),
  ])

  // QR codes are private; signed for an hour, read with the service role once ownership is known.
  const qrPaths = items.filter((i) => i.qr_path && i.status !== "cancelled").map((i) => i.qr_path!)
  const qrUrl = new Map<string, string>()
  if (qrPaths.length) {
    const { data } = await createServiceClient().storage.from("esim-qr").createSignedUrls(qrPaths, QR_URL_SECONDS)
    for (const row of data ?? []) if (row.path && row.signedUrl) qrUrl.set(row.path, row.signedUrl)
  }

  const progress = batchProgress(batch.orders)
  const lines = batch.orders.filter((o) => !o.replacement_of)
  const replacements = batch.orders.filter((o) => o.replacement_of)
  const itemsByOrder = new Map<string, BatchItem[]>()
  for (const item of items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item])

  const sum = (kind: LedgerEntry["kind"]) => (ledgerRows ?? []).filter((r) => r.kind === kind).reduce((n, r) => n + r.amount_cents, 0)
  const held = sum("reserve") - sum("capture") - sum("release")
  const waitingForCards = lines.filter((o) => o.product_type === "physical" && o.status === "shipped" && o.phase === "activate" && !o.activation_requested_at)
  const tracking = [...new Set(items.filter((i) => i.tracking_number).map((i) => i.tracking_number!))]

  return (
    <>
      <AdminPageHeader
        title={batchLabel(batch.number)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Tag tone={customerStatusTone[progress.status]}>{progress.status}</Tag>
            <span className="tabular">Placed {formatDateTime(batch.created_at)}</span>
            {batch.reference ? <span>&middot; {batch.reference}</span> : null}
          </span>
        }
        actions={
          <a href={`/dealer/orders/${batch.id}/sims.csv`} className={buttonVariants({ variant: "outline", size: "lg" })} download>
            <DownloadSimpleIcon data-icon="inline-start" />
            Download CSV
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {waitingForCards.length ? <ActivateCardsButton batchId={batch.id} /> : null}

          {lines.map((order) => (
            <LineCard key={order.id} order={order} items={itemsByOrder.get(order.id) ?? []} qrUrl={qrUrl} ticketTypes={ticketTypes ?? []} />
          ))}

          {replacements.length ? (
            <section aria-labelledby="replacements-title" className="flex flex-col gap-4">
              <h2 id="replacements-title" className="type-section-title">
                Replacements
              </h2>
              {replacements.map((order) => (
                <LineCard key={order.id} order={order} items={itemsByOrder.get(order.id) ?? []} qrUrl={qrUrl} replacement />
              ))}
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Panel title="Progress">
            <KeyValue label="SIMs live" value={`${progress.delivered} of ${progress.total}`} mono />
            <KeyValue label="Lines" value={lines.length} mono />
          </Panel>
          <Panel title="Payment">
            <KeyValue label="Order total" value={formatPrice(batch.total_cents)} mono strong />
            <KeyValue label="Taken so far" value={formatPrice(sum("capture"))} mono />
            <KeyValue label="Still held" value={formatPrice(Math.max(0, held))} mono />
            {sum("release") ? <KeyValue label="Returned" value={formatPrice(sum("release"))} mono /> : null}
            {sum("refund") ? <KeyValue label="Refunded" value={formatPrice(sum("refund"))} mono /> : null}
          </Panel>
          {batch.shipping_address ? (
            <Panel title="Delivery">
              <p className="text-sm">
                {batch.shipping_address.line1}
                {batch.shipping_address.line2 ? `, ${batch.shipping_address.line2}` : ""}
                <br />
                {batch.shipping_address.city}, {batch.shipping_address.state} <span className="tabular">{batch.shipping_address.zip}</span>
              </p>
              {tracking.map((t) => (
                <a
                  key={t}
                  href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                >
                  Track <span className="font-mono tabular">{t}</span>
                  <ArrowSquareOutIcon className="size-4" />
                </a>
              ))}
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  )
}

function LineCard({
  order,
  items,
  qrUrl,
  replacement,
  ticketTypes = [],
}: {
  order: BatchOrder
  items: BatchItem[]
  qrUrl: Map<string, string>
  replacement?: boolean
  ticketTypes?: { id: string; name: string }[]
}) {
  const delivered = items.filter((i) => i.status === "fulfilled" || i.status === "replaced")
  const status = customerOrderStatus(order)
  const esim = order.product_type === "esim"
  const live = items.filter((i) => customerItemStatus(order, i) === "Delivered").length
  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <header className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="type-card-title">
            {order.carrier_name} {order.plan_name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {productTypeLabel[order.product_type]} &middot; {formatDays(order.days)}
            {order.addon_name ? ` · ${order.addon_name}` : ""} &middot; <span className="font-mono tabular">{orderLabel(order)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {replacement ? null : (
            <span className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground tabular">{live}</span> of <span className="font-mono tabular">{order.quantity}</span> live
            </span>
          )}
          <Tag tone={customerStatusTone[status]}>{status}</Tag>
        </div>
      </header>
      <ul className="divide-y">
        {items.map((item) => {
          const itemStatus = customerItemStatus(order, item)
          const url = item.qr_path ? qrUrl.get(item.qr_path) : undefined
          const replaced = item.status === "replaced"
          return (
            <li key={item.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5", replaced && "text-muted-foreground")}>
              <p className="w-20 shrink-0 text-sm font-medium">SIM {item.seq}</p>
              <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                <Value label="Phone" value={item.phone_number} copy={!replaced} />
                <Value label="ICCID" value={item.iccid} copy={!replaced} />
              </dl>
              <div className="flex shrink-0 items-center gap-2">
                {/* The line carries the status; a SIM only says so when it differs. */}
                {replaced ? <Tag tone="neutral">Replaced</Tag> : itemStatus !== status ? <Tag tone={customerStatusTone[itemStatus]}>{itemStatus}</Tag> : null}
                {esim && url && !replaced ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-10")}
                    aria-label={`QR code for SIM ${item.seq}, opens in a new tab`}
                  >
                    QR code
                    <ArrowSquareOutIcon data-icon="inline-end" />
                  </a>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {!replacement && delivered.length && ticketTypes.length ? (
        <LineSupport
          submit={createDealerTicket.bind(null, order.id)}
          orderLabel={orderLabel(order)}
          types={ticketTypes}
          items={delivered.map((i) => ({ id: i.id, label: `SIM ${i.seq}${i.phone_number ? `, ${i.phone_number}` : i.iccid ? `, ICCID ${i.iccid}` : ""}` }))}
        />
      ) : null}
    </section>
  )
}

function Value({ label, value, copy = true }: { label: string; value: string | null; copy?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-mono text-sm break-all tabular sm:break-normal sm:whitespace-nowrap">{value ?? <span className="font-sans text-muted-foreground">Not yet</span>}</dd>
      </div>
      {value && copy ? <CopyButton value={value} label={`${label} ${value}`} className="size-8" /> : null}
    </div>
  )
}
