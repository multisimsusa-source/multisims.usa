import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowsClockwiseIcon,
  ChatCircleTextIcon,
  EnvelopeSimpleIcon,
  PhoneIcon,
} from "@phosphor-icons/react/ssr"

import { ProductBadge } from "@/components/site/product-mark"
import { Tag } from "@/components/patterns/tag"
import { Stars } from "@/components/patterns/star-rating"
import {
  OrderStatusTag,
  TicketStatusTag,
} from "@/components/patterns/status-tag"
import { KeyValue, Panel } from "@/components/patterns/panel"
import { Notice } from "@/components/patterns/notice"
import { Age } from "@/components/staff/age"
import { BulkTools } from "@/components/staff/bulk-tools"
import { ItemForm } from "@/components/staff/item-form"
import { itemReady, type ItemNeed } from "@/lib/staff/item-need"
import {
  AdminOrderControls,
  ReplaceButton,
  TrackingForm,
  WorkControls,
} from "@/components/staff/work-controls"
import type { Profile } from "@/lib/types"
import { formatDays, formatPrice, productTypeLabel, orderTitle } from "@/lib/format"
import {
  formatDateTime,
  orderLabel,
  paymentStatusLabel,
  paymentStatusTone,
  planStartLabel,
  severityLabel,
} from "@/lib/orders"
import { getBatchContext, getWorkOrder, listStaff } from "@/lib/staff/queries"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/server"
import { getLineTimers } from "@/lib/line-timers"
import { PlanTimer } from "@/components/patterns/plan-timer"
import { RefillDates } from "@/components/staff/refill-dates"

/**
 * The fulfilment screen. Agents fill SIMs here; the owner sees the same screen with
 * reassign, cancel and refund controls. Who may edit is decided again in Postgres.
 */
export async function OrderWorkspace({
  id,
  viewer,
}: {
  id: string
  viewer: Profile
}) {
  const isAdmin = viewer.role === "admin"
  const [data, staff] = await Promise.all([
    getWorkOrder(id),
    isAdmin ? listStaff() : Promise.resolve([]),
  ])
  if (!data) notFound()
  const {
    order,
    items,
    original,
    replacements,
    tickets,
    messages,
    payments,
    allowance,
    reviews,
  } = data
  const batch = order.batch_id
    ? await getBatchContext(order.batch_id, order.id)
    : null

  const refill = order.kind === "refill"
  // A refill or a card's activation works on a line: no QR, nothing to post.
  const refillLike = refill || order.kind === "activation"
  const esim = order.product_type === "esim" && !refillLike
  const holder = order.claimed_by === viewer.id || isAdmin
  const canWork =
    holder && (order.status === "claimed" || order.status === "needs_attention")
  const canClaim = order.status === "queued"
  const activation = order.phase === "activate"
  const need: ItemNeed = refill ? "refill" : order.kind === "activation" ? "activate" : esim ? "qr" : activation ? "activate" : "ship"
  const working = items.filter((i) =>
    activation ? i.status === "fulfilled" : i.status === "pending"
  )
  const missing = working.filter((i) => !itemReady(i, need)).length
  const base = isAdmin ? "/admin" : "/agent"
  const unit = esim ? "eSIM" : "SIM"
  const tracking = items.find((i) => i.tracking_number)?.tracking_number ?? null
  const canReplace = allowance.used < allowance.limit
  const supabase = await createClient()
  // A refill's proposed dates, and every delivered line's timer.
  const [refillDates, timers] = await Promise.all([
    refill && order.status !== "fulfilled" && order.status !== "cancelled"
      ? supabase.rpc("refill_dates_for_order", { p_order_id: order.id }).then(({ data }) =>
          new Map(((data ?? []) as { item_id: string; current_ends_on: string | null; starts_on: string; ends_on: string }[]).map((r) => [r.item_id, r]))
        )
      : Promise.resolve(new Map<string, { item_id: string; current_ends_on: string | null; starts_on: string; ends_on: string }>()),
    getLineTimers(supabase, items.filter((i) => i.status === "fulfilled")),
  ])

  return (
    <div className={cn("flex flex-col gap-6", canWork && "max-sm:pb-28")}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="tabular font-mono text-2xl font-semibold sm:text-3xl">
            {orderLabel(order)}
          </h1>
          <OrderStatusTag status={order.status} />
          {order.replacement_of ? (
            <Tag tone="warning">
              <ArrowsClockwiseIcon className="mr-1 size-3" />
              Replacement
            </Tag>
          ) : null}
          {refill ? <Tag tone="brand">Refill</Tag> : null}
          {order.kind === "activation" ? <Tag tone="brand">Activate SIM</Tag> : null}
          {order.kind === "card_only" ? <Tag tone="neutral">SIM cards only</Tag> : null}
          {order.refunded_at ? <Tag tone="neutral">Refunded</Tag> : null}
          {order.paid_at &&
          order.status !== "fulfilled" &&
          order.status !== "cancelled" ? (
            <span className="text-sm">
              <Age since={order.paid_at} className="text-sm" />{" "}
              <span className="text-muted-foreground">waiting</span>
            </span>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-lg font-medium">
          {orderTitle(order)}
          <ProductBadge type={order.product_type} />
        </p>
        <WorkControls
          orderId={order.id}
          status={order.status}
          need={need}
          canClaim={canClaim}
          canWork={canWork}
          missing={missing}
          cardOnly={order.kind === "card_only"}
        />
        {order.claimed_by && !holder && order.status === "claimed" ? (
          <p className="text-sm text-muted-foreground">
            Claimed by {order.claimer?.full_name || order.claimer?.email}{" "}
            <Age
              since={order.claimed_at ?? order.created_at}
              className="text-sm"
            />{" "}
            ago.
          </p>
        ) : null}
      </header>

      {order.status === "needs_attention" && order.attention_reason ? (
        <Notice tone="danger" title="Needs attention">
          {order.attention_reason}
        </Notice>
      ) : null}
      {order.staff_note && order.status !== "fulfilled" ? (
        <Notice tone="info" title="From the owner">
          {order.staff_note}
        </Notice>
      ) : null}
      {activation && order.status === "shipped" ? (
        <Notice
          tone="info"
          title={
            order.plan_start === "on_date"
              ? `Activation scheduled: ${planStartLabel(order).replace(/^On /, "")}`
              : "Posted, waiting for the customer"
          }
        >
          {order.plan_start === "on_date"
            ? "It comes into the queue on that date. Start the line then, so the plan days do not run while the card is in the post."
            : "It comes into the queue when the customer says the SIM has arrived. Do not start the line before then."}
        </Notice>
      ) : null}
      {activation &&
      order.status !== "shipped" &&
      order.status !== "fulfilled" &&
      order.status !== "cancelled" ? (
        <Notice tone="warning" title="Activate the line">
          {order.plan_start === "on_date"
            ? "The start date has come. "
            : "The customer has the SIM. "}
          Start each line by its ICCID, add the phone number, then mark it
          active. The customer gets the number by email and on their order page.
        </Notice>
      ) : null}
      {original ? (
        <Notice
          tone="warning"
          title={`Replaces ${unit} ${original.item?.seq ?? ""} of ${orderLabel(original)}`}
        >
          {original.item?.phone_number
            ? `Old number ${original.item.phone_number}. `
            : ""}
          {original.item?.iccid ? `Old ICCID ${original.item.iccid}. ` : ""}
          Same plan and customer; no payment.{" "}
          <Link
            href={`${base}/orders/${original.id}`}
            className="font-medium underline underline-offset-4"
          >
            Open the original
          </Link>
        </Notice>
      ) : null}

      {batch ? (
        <Notice
          tone="info"
          title={`Dealer order, ${batch.label} from ${batch.company}`}
        >
          Line {batch.line} of {batch.lines} in this bulk order.
          {batch.otherOpen
            ? ` ${batch.otherOpen} other ${batch.otherOpen === 1 ? "line is" : "lines are"} still being filled.`
            : ""}
          {!esim && !activation
            ? " All SIM cards in the batch go in one parcel with one tracking number."
            : ""}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section
          aria-label={`${unit}s`}
          className="flex min-w-0 flex-col gap-4"
        >
          {!esim && !refillLike ? (
            <TrackingForm
              orderId={order.id}
              current={tracking}
              editable={canWork && !activation}
              suggested={tracking ? null : (batch?.tracking ?? null)}
            />
          ) : null}
          {canWork && working.length >= 2 && !refill ? (
            <BulkTools
              orderId={order.id}
              qr={esim}
              cardOnly={order.kind === "card_only"}
              items={working.map((i) => ({
                id: i.id,
                seq: i.seq,
                hasQr: Boolean(i.qr_path),
              }))}
            />
          ) : null}
          {items.map((item) => (
            <div key={item.id}>
              <ItemForm
                // Remount with fresh defaults after each save.
                key={`${item.status}-${item.qr_path}-${item.phone_number}-${item.iccid}`}
                item={item}
                productType={refillLike ? "physical" : order.product_type}
                need={need}
                cardOnly={order.kind === "card_only"}
                editable={
                  canWork &&
                  (activation
                    ? item.status === "fulfilled"
                    : item.status === "pending")
                }
                title={
                  items.length > 1
                    ? `${unit} ${item.seq} of ${items.length}`
                    : unit
                }
              />
              {refill && item.status === "pending" && refillDates.get(item.id) ? (
                <div className="mt-2">
                  <RefillDates
                    key={`${item.plan_starts_on}-${item.plan_ends_on}`}
                    itemId={item.id}
                    currentEndsOn={refillDates.get(item.id)!.current_ends_on}
                    startsOn={item.plan_starts_on ?? refillDates.get(item.id)!.starts_on}
                    endsOn={item.plan_ends_on ?? refillDates.get(item.id)!.ends_on}
                    saved={Boolean(item.plan_ends_on)}
                    days={order.days ?? 1}
                    editable={canWork}
                  />
                </div>
              ) : null}
              {item.status !== "pending" && timers.get(item.id) ? (
                <PlanTimer timer={timers.get(item.id)!} className="mt-2 rounded-xl border bg-background px-4 py-3" />
              ) : null}
              {item.status === "fulfilled" ? (
                <div className="mt-2 flex justify-end">
                  {canReplace ? (
                    <ReplaceButton itemId={item.id} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Replacement limit reached ({allowance.used} of{" "}
                      {allowance.limit})
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
              agents={staff
                .filter((s) => s.active)
                .map((s) => ({ id: s.id, name: s.full_name || s.email }))}
              paid={Boolean(order.paid_at)}
              refunded={Boolean(order.refunded_at)}
            />
          ) : null}

          <Panel title="Line to get">
            <KeyValue
              label="Carrier and plan"
              value={`${orderTitle(order)}`}
            />
            <KeyValue
              label="Product"
              value={productTypeLabel[order.product_type]}
            />
            <KeyValue
              label="Days"
              value={order.days !== null ? formatDays(order.days) : "No plan, SIM card only"}
            />
            {refillLike ? (
              <KeyValue label="Order" value={refill ? "Refill: add days to the number" : "Activate this SIM card"} strong />
            ) : null}
            <KeyValue label="Quantity" value={String(order.quantity)} mono />
            {/* A new line needs a ZIP and maybe an area code; cards without a plan and refills do not. */}
            {order.kind !== "card_only" && !refill ? (
              <>
                <KeyValue
                  label="ZIP code"
                  value={order.zip_code ?? "Not given"}
                  mono={Boolean(order.zip_code)}
                />
                <KeyValue
                  label="Area code"
                  value={order.area_code ?? "Any"}
                  mono={Boolean(order.area_code)}
                  strong={Boolean(order.area_code)}
                />
              </>
            ) : null}
            {!esim && order.plan_start ? (
              <KeyValue
                label="Plan start"
                value={planStartLabel(order)}
                strong
              />
            ) : null}
            {order.area_code ? (
              <KeyValue
                label="If not available"
                value="Deliver the nearest area code"
              />
            ) : null}
            {order.addon_name ? (
              <KeyValue
                label="Add-on"
                value={`${order.addon_name}: switch it on`}
                strong
              />
            ) : null}
          </Panel>

          <Panel title={order.channel === "dealer" ? "Dealer" : "Customer"}>
            <p className="font-medium">{order.customer_name}</p>
            <a
              href={`mailto:${order.customer_email}`}
              className="flex min-h-9 items-center gap-2 text-sm break-all text-brand hover:underline"
            >
              <EnvelopeSimpleIcon className="size-4 shrink-0" />
              {order.customer_email}
            </a>
            {/\d/.test(order.customer_phone) ? (
              <a
                href={`tel:${order.customer_phone.replace(/[^+\d]/g, "")}`}
                className="flex min-h-9 items-center gap-2 text-sm text-brand hover:underline"
              >
                <PhoneIcon className="size-4 shrink-0" />
                {order.customer_phone}
              </a>
            ) : null}
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
                {order.shipping_address.city}, {order.shipping_address.state}{" "}
                {order.shipping_address.zip}
              </address>
            ) : null}
          </Panel>

          {messages.length ? (
            <Panel title="Messages from the customer">
              <ul className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ChatCircleTextIcon className="size-3.5" />{" "}
                      {formatDateTime(m.created_at)}
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
                    <Link
                      href={`${base}/tickets/${t.id}`}
                      className="flex items-center justify-between gap-2 rounded-md py-1 text-sm hover:underline"
                    >
                      <span>
                        <span className="tabular font-mono text-muted-foreground">
                          #{t.number}
                        </span>{" "}
                        {t.type_name}
                        <span className="text-muted-foreground">
                          , {severityLabel[t.severity].toLowerCase()}
                        </span>
                      </span>
                      <TicketStatusTag status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {replacements.length ? (
            <Panel
              title={`Replacements (${allowance.used} of ${allowance.limit})`}
            >
              <ul className="flex flex-col gap-2">
                {replacements.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`${base}/orders/${r.id}`}
                      className="flex items-center justify-between gap-2 py-1 text-sm hover:underline"
                    >
                      <span className="tabular font-mono">{orderLabel(r)}</span>
                      <OrderStatusTag status={r.status} />
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
                  <li
                    key={p.id}
                    className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">
                        {formatDateTime(p.created_at)}
                      </span>
                      <span className="flex gap-1.5">
                        {p.overpaid ? <Tag tone="warning">Overpaid</Tag> : null}
                        <Tag tone={paymentStatusTone[p.status]}>
                          {paymentStatusLabel[p.status]}
                        </Tag>
                      </span>
                    </div>
                    {p.pay_currency ? (
                      <KeyValue
                        label="Coin"
                        value={p.pay_currency.toUpperCase()}
                        mono
                      />
                    ) : null}
                    {p.pay_amount ? (
                      <KeyValue label="Expected" value={p.pay_amount} mono />
                    ) : null}
                    {p.actually_paid ? (
                      <KeyValue
                        label="Received"
                        value={p.actually_paid}
                        mono
                        strong
                      />
                    ) : null}
                    {p.provider_payment_id ? (
                      <KeyValue
                        label="Reference"
                        value={p.provider_payment_id}
                        mono
                      />
                    ) : null}
                    {p.status === "awaiting" && p.invoice_url ? (
                      <a
                        href={p.invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center text-sm font-medium text-brand hover:underline"
                      >
                        Payment page
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {isAdmin && reviews.length ? (
            <Panel
              title="Ratings"
              action={
                <Link
                  href="/admin/reviews"
                  className="inline-flex min-h-9 items-center text-sm font-medium text-brand hover:underline"
                >
                  All reviews
                </Link>
              }
            >
              <ul className="flex flex-col divide-y">
                {reviews.map((r) => {
                  const item = r.order_item_id
                    ? items.find((i) => i.id === r.order_item_id)
                    : null
                  return (
                    <li key={r.id} className="py-2 text-sm first:pt-0 last:pb-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Stars rating={r.rating} />
                        <span className="text-muted-foreground">
                          {item
                            ? `${unit} ${item.seq}`
                            : order.channel === "dealer"
                              ? "Whole line"
                              : "Whole order"}
                        </span>
                        {r.featured ? <Tag tone="success">On website</Tag> : null}
                        {r.hidden ? <Tag tone="neutral">Hidden</Tag> : null}
                      </p>
                      {r.comment ? (
                        <p className="mt-1 whitespace-pre-line">{r.comment}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(r.created_at)}
                        {r.updated_at
                          ? `, changed ${formatDateTime(r.updated_at)}`
                          : ""}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Record">
            <KeyValue label="Placed" value={formatDateTime(order.created_at)} />
            {order.claimed_at ? (
              <KeyValue
                label="Claimed"
                value={`${formatDateTime(order.claimed_at)}${order.claimer ? `, ${order.claimer.full_name || order.claimer.email}` : ""}`}
              />
            ) : null}
            {order.shipped_at && !esim && !refillLike ? (
              <KeyValue label="Shipped" value={formatDateTime(order.shipped_at)} />
            ) : null}
            {/* Card-only orders are done once shipped; the rest record when the line went live. */}
            {order.fulfilled_at && order.kind !== "card_only" ? (
              <KeyValue
                label={esim ? "Delivered" : refill ? "Refilled" : "Activated"}
                value={formatDateTime(order.fulfilled_at)}
              />
            ) : null}
            {order.cancelled_at ? (
              <KeyValue
                label="Cancelled"
                value={`${formatDateTime(order.cancelled_at)}${order.cancel_reason ? `: ${order.cancel_reason}` : ""}`}
              />
            ) : null}
            {order.refunded_at ? (
              <KeyValue
                label="Refunded"
                value={`${formatDateTime(order.refunded_at)}${order.refund_note ? `: ${order.refund_note}` : ""}`}
              />
            ) : null}
            {isAdmin ? (
              <KeyValue
                label="Total"
                value={formatPrice(order.total_cents)}
                mono
              />
            ) : null}
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
