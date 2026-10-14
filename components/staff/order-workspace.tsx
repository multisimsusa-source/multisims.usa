import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowsClockwiseIcon, ChatCircleTextIcon, EnvelopeSimpleIcon, PhoneIcon } from "@phosphor-icons/react/ssr"

import { ProductBadge } from "@/components/site/product-mark"
import { Tag } from "@/components/patterns/tag"
import { KeyValue, Panel } from "@/components/patterns/panel"
import { Notice } from "@/components/patterns/notice"
import { Age } from "@/components/staff/age"
import { ItemForm } from "@/components/staff/item-form"
import { itemReady, type ItemNeed } from "@/lib/staff/item-need"
import { AdminOrderControls, ReplaceButton, TrackingForm, WorkControls } from "@/components/staff/work-controls"
import type { Profile } from "@/lib/types"
import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import {
  formatDateTime,
  orderLabel,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
  planStartLabel,
  severityLabel,
  ticketStatusLabel,
  ticketStatusTone,
} from "@/lib/orders"
import { getWorkOrder, listStaff } from "@/lib/staff/queries"
import { cn } from "@/lib/utils"

/**
 * The fulfilment screen. Agents fill SIMs here; the owner sees the same screen with
 * reassign, cancel and refund controls. Who may edit is decided again in Postgres.
 */
export async function OrderWorkspace({ id, viewer }: { id: string; viewer: Profile }) {
  const isAdmin = viewer.role === "admin"
  const [data, staff] = await Promise.all([getWorkOrder(id), isAdmin ? listStaff() : Promise.resolve([])])
  if (!data) notFound()
  const { order, items, original, replacements, tickets, messages, payments, allowance } = data

  const esim = order.product_type === "esim"
  const holder = order.claimed_by === viewer.id || isAdmin
  const canWork = holder && (order.status === "claimed" || order.status === "needs_attention")
  const canClaim = order.status === "queued"
  const activation = order.phase === "activate"
  const need: ItemNeed = esim ? "qr" : activation ? "activate" : "ship"
  const working = items.filter((i) => (activation ? i.status === "fulfilled" : i.status === "pending"))
  const missing = working.filter((i) => !itemReady(i, need)).length
  const base = isAdmin ? "/admin" : "/agent"
  const unit = esim ? "eSIM" : "SIM"
  const tracking = items.find((i) => i.tracking_number)?.tracking_number ?? null
  const canReplace = allowance.used < allowance.limit

  return (
    <div className={cn("flex flex-col gap-6", canWork && "max-sm:pb-28")}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-semibold tabular sm:text-3xl">{orderLabel(order)}</h1>
          <Tag tone={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</Tag>
          {order.replacement_of ? (
            <Tag tone="warning">
              <ArrowsClockwiseIcon className="mr-1 size-3" />
              Replacement
            </Tag>
          ) : null}
          {order.refunded_at ? <Tag tone="neutral">Refunded</Tag> : null}
          {order.paid_at && order.status !== "fulfilled" && order.status !== "cancelled" ? (
            <span className="text-sm">
              <Age since={order.paid_at} className="text-sm" /> <span className="text-muted-foreground">waiting</span>
            </span>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-lg font-medium">
          {order.carrier_name} {order.plan_name}
          <ProductBadge type={order.product_type} />
        </p>
        <WorkControls orderId={order.id} status={order.status} need={need} canClaim={canClaim} canWork={canWork} missing={missing} />
        {order.claimed_by && !holder && order.status === "claimed" ? (
          <p className="text-sm text-muted-foreground">
            Claimed by {order.claimer?.full_name || order.claimer?.email} <Age since={order.claimed_at ?? order.created_at} className="text-sm" /> ago.
          </p>
        ) : null}
      </header>

      {order.status === "needs_attention" && order.attention_reason ? (
        <Notice tone="danger" title="Needs attention">
          {order.attention_reason}
        </Notice>
      ) : null}
      {order.staff_note && order.status !== "fulfilled" ? <Notice tone="info" title="From the owner">{order.staff_note}</Notice> : null}
      {activation && order.status === "shipped" ? (
        <Notice tone="info" title={order.plan_start === "on_date" ? `Activation scheduled: ${planStartLabel(order).replace(/^On /, "")}` : "Posted, waiting for the customer"}>
          {order.plan_start === "on_date"
            ? "It comes into the queue on that date. Start the line then, so the plan days do not run while the card is in the post."
            : "It comes into the queue when the customer says the SIM has arrived. Do not start the line before then."}
        </Notice>
      ) : null}
      {activation && order.status !== "shipped" && order.status !== "fulfilled" && order.status !== "cancelled" ? (
        <Notice tone="warning" title="Activate the line">
          {order.plan_start === "on_date" ? "The start date has come. " : "The customer has the SIM. "}
          Start each line by its ICCID, add the phone number, then mark it active. The customer gets the number by email and on their order page.
        </Notice>
      ) : null}
      {original ? (
        <Notice tone="warning" title={`Replaces ${unit} ${original.item?.seq ?? ""} of ${orderLabel(original)}`}>
          {original.item?.phone_number ? `Old number ${original.item.phone_number}. ` : ""}
          {original.item?.iccid ? `Old ICCID ${original.item.iccid}. ` : ""}
          Same plan and customer; no payment.{" "}
          <Link href={`${base}/orders/${original.id}`} className="font-medium underline underline-offset-4">
            Open the original
          </Link>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-label={`${unit}s`} className="flex min-w-0 flex-col gap-4">
          {!esim ? <TrackingForm orderId={order.id} current={tracking} editable={canWork && !activation} /> : null}
          {items.map((item) => (
            <div key={item.id}>
              <ItemForm
                // Remount with fresh defaults after each save.
                key={`${item.status}-${item.qr_path}-${item.phone_number}-${item.iccid}`}
                item={item}
                productType={order.product_type}
                need={need}
                editable={canWork && (activation ? item.status === "fulfilled" : item.status === "pending")}
                title={items.length > 1 ? `${unit} ${item.seq} of ${items.length}` : unit}
              />
              {item.status === "fulfilled" ? (
                <div className="mt-2 flex justify-end">
                  {canReplace ? (
                    <ReplaceButton itemId={item.id} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Replacement limit reached ({allowance.used} of {allowance.limit})
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </section>

        <aside className="flex flex-col gap-4">
          {isAdmin ? (
            <AdminOrderControls
              orderId={order.id}
              status={order.status}
              claimedBy={order.claimed_by}
              meId={viewer.id}
              agents={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.full_name || s.email }))}
              paid={Boolean(order.paid_at)}
              refunded={Boolean(order.refunded_at)}
            />
          ) : null}

          <Panel title="Line to get">
            <KeyValue label="Carrier and plan" value={`${order.carrier_name} ${order.plan_name}`} />
            <KeyValue label="Product" value={productTypeLabel[order.product_type]} />
            <KeyValue label="Days" value={formatDays(order.days)} />
            <KeyValue label="Quantity" value={String(order.quantity)} mono />
            <KeyValue label="ZIP code" value={order.zip_code ?? "Not given"} mono={Boolean(order.zip_code)} />
            <KeyValue label="Area code" value={order.area_code ?? "Any"} mono={Boolean(order.area_code)} strong={Boolean(order.area_code)} />
            {!esim && order.plan_start ? <KeyValue label="Plan start" value={planStartLabel(order)} strong /> : null}
            {order.area_code ? <KeyValue label="If not available" value="Deliver the nearest area code" /> : null}
            {order.addon_name ? <KeyValue label="Add-on" value={`${order.addon_name}: switch it on`} strong /> : null}
          </Panel>

          <Panel title="Customer">
            <p className="font-medium">{order.customer_name}</p>
            <a href={`mailto:${order.customer_email}`} className="flex min-h-9 items-center gap-2 text-sm break-all text-brand hover:underline">
              <EnvelopeSimpleIcon className="size-4 shrink-0" />
              {order.customer_email}
            </a>
            <a href={`tel:${order.customer_phone.replace(/[^+\d]/g, "")}`} className="flex min-h-9 items-center gap-2 text-sm text-brand hover:underline">
              <PhoneIcon className="size-4 shrink-0" />
              {order.customer_phone}
            </a>
            {order.shipping_address ? (
              <address className="mt-2 text-sm not-italic select-all">
                {order.customer_name}
                <br />
                {order.shipping_address.line1}
                {order.shipping_address.line2 ? (
                  <>
                    <br />
                    {order.shipping_address.line2}
                  </>
                ) : null}
                <br />
                {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
              </address>
            ) : null}
          </Panel>

          {messages.length ? (
            <Panel title="Messages from the customer">
              <ul className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ChatCircleTextIcon className="size-3.5" /> {formatDateTime(m.created_at)}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{m.message}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {tickets.length ? (
            <Panel title="Tickets">
              <ul className="flex flex-col gap-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`${base}/tickets/${t.id}`} className="flex items-center justify-between gap-2 rounded-md py-1 text-sm hover:underline">
                      <span>
                        <span className="font-mono text-muted-foreground tabular">#{t.number}</span> {t.type_name}
                        <span className="text-muted-foreground">, {severityLabel[t.severity].toLowerCase()}</span>
                      </span>
                      <Tag tone={ticketStatusTone[t.status]}>{ticketStatusLabel[t.status]}</Tag>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {replacements.length ? (
            <Panel title={`Replacements (${allowance.used} of ${allowance.limit})`}>
              <ul className="flex flex-col gap-2">
                {replacements.map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/orders/${r.id}`} className="flex items-center justify-between gap-2 py-1 text-sm hover:underline">
                      <span className="font-mono tabular">{orderLabel(r)}</span>
                      <Tag tone={orderStatusTone[r.status]}>{orderStatusLabel[r.status]}</Tag>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {isAdmin && payments.length ? (
            <Panel title="Payments">
              <ul className="flex flex-col divide-y">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{formatDateTime(p.created_at)}</span>
                      <span className="flex gap-1.5">
                        {p.overpaid ? <Tag tone="warning">Overpaid</Tag> : null}
                        <Tag tone={paymentStatusTone[p.status]}>{paymentStatusLabel[p.status]}</Tag>
                      </span>
                    </div>
                    {p.pay_currency ? <KeyValue label="Coin" value={p.pay_currency.toUpperCase()} mono /> : null}
                    {p.pay_amount ? <KeyValue label="Expected" value={p.pay_amount} mono /> : null}
                    {p.actually_paid ? <KeyValue label="Received" value={p.actually_paid} mono strong /> : null}
                    {p.provider_payment_id ? <KeyValue label="Reference" value={p.provider_payment_id} mono /> : null}
                    {p.status === "awaiting" && p.invoice_url ? (
                      <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-sm font-medium text-brand hover:underline">
                        Payment page
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Record">
            <KeyValue label="Placed" value={formatDateTime(order.created_at)} />
            {order.claimed_at ? <KeyValue label="Claimed" value={`${formatDateTime(order.claimed_at)}${order.claimer ? `, ${order.claimer.full_name || order.claimer.email}` : ""}`} /> : null}
            {order.fulfilled_at ? <KeyValue label={esim ? "Delivered" : "Shipped"} value={formatDateTime(order.fulfilled_at)} /> : null}
            {order.cancelled_at ? <KeyValue label="Cancelled" value={`${formatDateTime(order.cancelled_at)}${order.cancel_reason ? `: ${order.cancel_reason}` : ""}`} /> : null}
            {order.refunded_at ? <KeyValue label="Refunded" value={`${formatDateTime(order.refunded_at)}${order.refund_note ? `: ${order.refund_note}` : ""}`} /> : null}
            {isAdmin ? <KeyValue label="Total" value={formatPrice(order.total_cents)} mono /> : null}
            {isAdmin && !order.replacement_of ? (
              <a
                href={`/order/${order.public_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-9 items-center text-sm font-medium text-brand hover:underline"
              >
                Customer&apos;s order page
              </a>
            ) : null}
          </Panel>
        </aside>
      </div>
    </div>
  )
}
