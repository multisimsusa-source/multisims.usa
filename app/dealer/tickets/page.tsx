import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { LifebuoyIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { TicketStatusTag } from "@/components/patterns/status-tag"
import { requireRole } from "@/lib/auth"
import { batchLabel } from "@/lib/dealers"
import { formatDateTime, orderLabel, severityLabel } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import type { Ticket } from "@/lib/types"

export const metadata: Metadata = { title: "Tickets" }

type Row = Pick<
  Ticket,
  | "id"
  | "number"
  | "type_name"
  | "severity"
  | "status"
  | "description"
  | "answer"
  | "answered_at"
  | "created_at"
> & {
  order: { number: number; batch: { id: string; number: number } | null }
  item: {
    seq: number
    phone_number: string | null
    iccid: string | null
  } | null
}

export default function DealerTicketsPage() {
  return (
    <>
      <AdminPageHeader
        title="Tickets"
        description="Problems you reported and our answers. To report a new one, open the order and choose Report a problem under the line."
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Tickets />
      </Suspense>
    </>
  )
}

async function Tickets() {
  await requireRole("dealer")
  const supabase = await createClient()
  const { data } = await supabase
    .from("tickets")
    .select(
      `id, number, type_name, severity, status, description, answer, answered_at, created_at,
       order:orders!tickets_order_id_fkey!inner ( number, batch:order_batches ( id, number ) ),
       item:order_items!tickets_order_item_id_fkey ( seq, phone_number, iccid )`
    )
    .order("created_at", { ascending: false })
    .limit(200)
  const tickets = (data ?? []) as unknown as Row[]

  if (!tickets.length) {
    return (
      <EmptyState
        icon={<LifebuoyIcon />}
        title="No tickets"
        action={
          <Link
            href="/dealer/orders"
            className="text-sm font-medium text-brand hover:underline"
          >
            Go to your orders
          </Link>
        }
      >
        If a line does not work, open its order and choose Report a problem.
      </EmptyState>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {tickets.map((t) => (
        <li key={t.id} id={`t-${t.number}`} className="scroll-mt-20 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{t.type_name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <span className="tabular font-mono">#{t.number}</span>,{" "}
                {severityLabel[t.severity].toLowerCase()} priority,{" "}
                {formatDateTime(t.created_at)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.order.batch ? (
                  <Link
                    href={`/dealer/orders/${t.order.batch.id}`}
                    className="tabular font-mono text-brand hover:underline"
                  >
                    {batchLabel(t.order.batch.number)}
                  </Link>
                ) : null}{" "}
                <span className="tabular font-mono">{orderLabel(t.order)}</span>
                {t.item
                  ? `, SIM ${t.item.seq}${t.item.phone_number ? ` (${t.item.phone_number})` : ""}`
                  : ""}
              </p>
            </div>
            <TicketStatusTag status={t.status} />
          </div>
          <p className="mt-3 line-clamp-3 max-w-[65ch] text-sm whitespace-pre-line">
            {t.description}
          </p>
          {t.answer ? (
            <div className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
              <p className="mb-1 text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
                Our answer
              </p>
              <p className="whitespace-pre-line">{t.answer}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No answer yet. We email you when there is one.
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
