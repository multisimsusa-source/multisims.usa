import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowSquareOutIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr"

import { EmptyState } from "@/components/patterns/empty-state"
import { Tag } from "@/components/patterns/tag"
import { AnswerForm } from "@/components/staff/answer-form"
import { UrlFilters } from "@/components/staff/url-filters"
import { ReplaceButton } from "@/components/staff/work-controls"
import { formatDateTime, orderLabel, orderStatusLabel, orderStatusTone, severityLabel, severityTone, ticketStatusLabel, ticketStatusTone } from "@/lib/orders"
import { getTicket, listTickets } from "@/lib/staff/queries"
import type { TicketStatus } from "@/lib/types"

const FILTERS = ["active", "open", "in_progress", "resolved", "all"] as const

export async function TicketsList({ searchParams, base }: { searchParams: Record<string, string | string[] | undefined>; base: "/admin" | "/agent" }) {
  const params = Object.fromEntries(Object.entries(searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const status = (FILTERS as readonly string[]).includes(params.status) ? (params.status as (typeof FILTERS)[number]) : "active"
  const all = await listTickets(status as TicketStatus | "all" | "active")
  const q = (params.q ?? "").trim().toLowerCase()
  const tickets = q
    ? all.filter((t) =>
        [`#${t.number}`, String(t.number), orderLabel(t.order).toLowerCase(), t.order.customer_email, t.order.customer_name.toLowerCase(), t.type_name.toLowerCase()].some((s) =>
          s.toLowerCase().includes(q)
        )
      )
    : all
  // Most urgent first, then oldest first among equals.
  const rank = { urgent: 0, high: 1, medium: 2, low: 3 }
  if (status === "active" || status === "open") tickets.sort((a, b) => rank[a.severity] - rank[b.severity] || a.created_at.localeCompare(b.created_at))

  return (
    <>
      <UrlFilters
        query={params.q ?? ""}
        placeholder="Ticket, order number, customer or type"
        params={params}
        selects={[
          {
            param: "status",
            label: "Filter by status",
            value: status,
            items: [
              { value: "active", label: "Open and in progress" },
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In progress" },
              { value: "resolved", label: "Resolved" },
              { value: "all", label: "All tickets" },
            ],
            className: "lg:w-52",
          },
        ]}
      />
      {tickets.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-background">
          {tickets.map((t) => (
            <li key={t.id} className="relative flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`${base}/tickets/${t.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                    <span className="font-mono text-muted-foreground tabular">#{t.number}</span> {t.type_name}
                  </Link>
                  <Tag tone={severityTone[t.severity]}>{severityLabel[t.severity]}</Tag>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {orderLabel(t.order)}, {t.order.customer_name}, {formatDateTime(t.created_at)}
                </p>
              </div>
              <Tag tone={ticketStatusTone[t.status]}>{ticketStatusLabel[t.status]}</Tag>
            </li>
          ))}
        </ul>
      ) : (
        status === "active" && !q ? (
          <EmptyState icon={<CheckCircleIcon weight="fill" className="text-success-ink" />} title="No open tickets">
            New requests from customers&apos; order pages appear here and ring in the portal.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing matches these filters" />
        )
      )}
    </>
  )
}

export async function TicketView({ id, base }: { id: string; base: "/admin" | "/agent" }) {
  const data = await getTicket(id)
  if (!data) notFound()
  const { ticket: t, items, replacements, replacementItems, screenshotUrl, answeredBy, allowance } = data
  const unit = t.order.product_type === "esim" ? "eSIM" : "SIM"

  // Delivered SIMs this ticket can replace: the original's, and delivered replacements.
  const replaceable = [
    ...items.filter((i) => i.status === "fulfilled").map((i) => ({ ...i, label: `${unit} ${i.seq}` })),
    ...replacementItems
      .filter((i) => i.status === "fulfilled")
      .map((i) => {
        const rep = replacements.find((r) => r.id === i.order_id)
        return { ...i, label: `Replacement ${rep ? orderLabel(rep) : ""}` }
      }),
  ]
  const about = [...items, ...replacementItems].find((i) => i.id === t.order_item_id)
  const canReplace = allowance.used < allowance.limit

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-mono text-sm text-muted-foreground tabular">Ticket #{t.number}</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t.type_name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tag tone={ticketStatusTone[t.status]}>{ticketStatusLabel[t.status]}</Tag>
          <Tag tone={severityTone[t.severity]}>{severityLabel[t.severity]} priority</Tag>
          <span className="text-sm text-muted-foreground">{formatDateTime(t.created_at)}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-xl border bg-background p-4 sm:p-5">
            <h2 className="mb-2 type-overline">From the customer</h2>
            <p className="whitespace-pre-line">{t.description}</p>
            {screenshotUrl ? (
              <a href={screenshotUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotUrl} alt="Screenshot from the customer" className="max-h-96 rounded-lg border object-contain" />
                <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  Open full size <ArrowSquareOutIcon className="size-3" />
                </span>
              </a>
            ) : null}
          </section>

          <section aria-label="Answer">
            <AnswerForm ticketId={t.id} status={t.status} answer={t.answer} />
            {answeredBy && t.answered_at ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Last answered by {answeredBy.full_name || answeredBy.email}, {formatDateTime(t.answered_at)}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-background p-4">
            <h2 className="mb-3 type-overline">Order</h2>
            <Link href={`${base}/orders/${t.order_id}`} className="font-mono font-medium text-brand tabular hover:underline">
              {orderLabel(t.order)}
            </Link>
            <p className="mt-1 text-sm">
              {t.order.carrier_name} {t.order.plan_name}
            </p>
            <p className="mt-2 text-sm">{t.order.customer_name}</p>
            <a href={`mailto:${t.order.customer_email}`} className="text-sm break-all text-brand hover:underline">
              {t.order.customer_email}
            </a>
            {about ? (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">About:</span> {unit} {about.seq}
                {about.phone_number ? <span className="font-mono">, {about.phone_number}</span> : null}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border bg-background p-4">
            <h2 className="mb-1 type-overline">Replacement</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              A free new {unit} goes straight into the agent queue. {allowance.used} of {allowance.limit} used on this order.
            </p>
            {!canReplace ? (
              <p className="text-sm text-muted-foreground">This order has reached its replacement limit. The owner can raise it in Settings.</p>
            ) : replaceable.length ? (
              <ul className="divide-y">
                {replaceable.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0">
                    <span className="min-w-0">
                      <span className="block font-medium">{i.label}</span>
                      {i.phone_number ? <span className="block font-mono text-xs text-muted-foreground tabular">{i.phone_number}</span> : null}
                    </span>
                    <ReplaceButton itemId={i.id} ticketId={t.id} label="Replace" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No delivered {unit}s to replace.</p>
            )}
            {replacements.length ? (
              <ul className="mt-3 flex flex-col gap-1 border-t pt-3">
                {replacements.map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/orders/${r.id}`} className="flex items-center justify-between gap-2 py-1 text-sm hover:underline">
                      <span className="font-mono tabular">{orderLabel(r)}</span>
                      <Tag tone={orderStatusTone[r.status]}>{orderStatusLabel[r.status]}</Tag>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  )
}
