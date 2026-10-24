import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import {
  ArrowSquareOutIcon,
  CheckIcon,
  PackageIcon,
  QrCodeIcon,
} from "@phosphor-icons/react/ssr"

import { Skeleton } from "@/components/ui/skeleton"
import { CopyButton } from "@/components/patterns/copy-button"
import { DetailList, DetailRow } from "@/components/patterns/detail-list"
import { Notice } from "@/components/patterns/notice"
import { Container } from "@/components/site/section"
import { Tag } from "@/components/patterns/tag"
import { TicketStatusTag } from "@/components/patterns/status-tag"
import {
  getCustomerOrder,
  type Activation,
  type CustomerItem,
} from "@/lib/customer-order"
import { orderLines } from "@/lib/pricing"
import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import {
  customerItemStatus,
  customerOrderStatus,
  formatDateTime,
  orderLabel,
  planStartLabel,
  severityLabel,
  type CustomerStatus,
} from "@/lib/orders"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"
import { createTicket, requestActivation, startPayment } from "./actions"
import { ContactPanel } from "./contact-panel"
import { LiveRefresh } from "./live-refresh"
import { ActivateButton, PayButton } from "./pay-button"
import { ReviewPanel } from "./review-panel"
import { SupportPanel } from "./support-panel"

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  // The URL is the customer's key: never send it to other sites.
  referrer: "no-referrer",
}

export default function OrderPage({
  params,
  searchParams,
}: PageProps<"/order/[token]">) {
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <Suspense fallback={<OrderSkeleton />}>
        <OrderView params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}

async function OrderView({
  params,
  searchParams,
}: PageProps<"/order/[token]">) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const [data, { data: settings }] = await Promise.all([
    getCustomerOrder(token),
    createServiceClient()
      .from("settings")
      .select("unclaimed_alert_minutes")
      .maybeSingle(),
  ])
  if (!data) notFound()

  const {
    order,
    items,
    pendingReplacements,
    activations,
    tickets,
    ticketTypes,
    lastMessageAt,
    review,
  } = data
  const status = customerOrderStatus(order)
  const esim = order.product_type === "esim"
  const unpaid = order.status === "awaiting_payment"
  const processing = status === "Processing" && !unpaid
  const activating = activations.some((a) => a.requested)
  const unit = esim ? "eSIM" : "SIM card"
  const delivered = items.filter(
    (i) => i.status === "fulfilled" || i.status === "replaced"
  )
  const availableAt = order.paid_at
    ? new Date(order.paid_at).getTime() +
      (settings?.unclaimed_alert_minutes ?? 5) * 60_000
    : Infinity

  // Live lines first (replacements next to the SIM they replace), replaced ones last.
  const shown = items
    .filter((i) => i.status !== "pending" && i.status !== "cancelled")
    .sort(
      (a, b) =>
        Number(a.status === "replaced") - Number(b.status === "replaced") ||
        (a.replaces_seq ?? a.seq) - (b.replaces_seq ?? b.seq)
    )

  const ticketItems = items
    .filter((i) => i.status === "fulfilled")
    .map((i) => ({ id: i.id, label: itemTitle(i, unit, items.length) }))

  return (
    <>
      <LiveRefresh
        active={
          processing || unpaid || activating || pendingReplacements.length > 0
        }
      />

      {query.activation === "requested" || query.activation === "done" ? (
        <Notice tone="success" className="mb-8">
          {query.activation === "requested"
            ? "Thanks. Your line is starting up. Your phone number appears on this page once it is active, and we email it to you."
            : "Your activation is already on its way. Your phone number appears on this page once your line is active."}
        </Notice>
      ) : null}

      {query.pay === "error" || query.pay === "busy" ? (
        <Notice tone="danger" className="mb-8">
          {query.pay === "busy"
            ? "Too many attempts from this connection. Please wait a few minutes, then try again."
            : "We could not open the payment page. Your order is saved: try again below in a moment."}
        </Notice>
      ) : null}

      {(query.placed === "1" || query.paid === "1") && !unpaid ? (
        <Notice tone="success" className="mb-8">
          <span className="font-medium">Order placed.</span> We emailed this
          page&apos;s link to{" "}
          <span className="font-medium break-all">{order.customer_email}</span>.
          Bookmark it: it is the only way back to your order.
        </Notice>
      ) : null}

      <header>
        <div className="flex items-center gap-3">
          <p className="tabular font-mono text-sm text-muted-foreground">
            {orderLabel(order)}
          </p>
          <StatusTag status={status} />
        </div>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          {order.carrier_name} {order.plan_name}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {order.quantity} x {productTypeLabel[order.product_type]},{" "}
          {formatDays(order.days)}
          {order.addon_name ? `, with ${order.addon_name.toLowerCase()}` : ""}
        </p>
      </header>

      <section aria-label="Order status" className="mt-8">
        {unpaid ? (
          <PaymentPanel order={order} returned={query.paid === "1"} />
        ) : status === "Cancelled" ? (
          <div className="rounded-xl border bg-card p-6">
            <p className="text-lg font-semibold">This order was cancelled</p>
            <p className="mt-1 text-muted-foreground">
              {order.refunded_at
                ? "Your refund has been sent."
                : "If you paid, we are in touch with you by email about your refund."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-5 sm:p-6">
            <Progress order={order} status={status} />
            <p className="mt-6 max-w-[60ch] text-sm text-muted-foreground">
              {processing
                ? esim
                  ? `Your ${order.quantity > 1 ? "QR codes appear" : "QR code appears"} here as soon as ${order.quantity > 1 ? "they are" : "it is"} ready, and we email ${order.quantity > 1 ? "them" : "it"} to ${order.customer_email}. This page updates on its own.`
                  : `Your tracking number appears here as soon as your SIM card ships, and we email it to ${order.customer_email}. This page updates on its own.`
                : esim
                  ? "Scan the QR code below with the phone you will use in the US. We also emailed it to you."
                  : status === "Delivered"
                    ? "Your line is active. Your phone number is below, and we emailed it to you."
                    : "Your SIM card is on its way by USPS. Track it with the number below."}
            </p>
          </div>
        )}
        {activations.map((a) => (
          <div key={a.orderId} className="mt-4">
            <ActivationPanel
              token={order.public_token}
              activation={a}
              single={activations.length === 1}
            />
          </div>
        ))}
        {order.status === "fulfilled" && order.channel === "website" ? (
          <div className="mt-4">
            <ReviewPanel token={order.public_token} given={review} />
          </div>
        ) : null}
        {processing ? (
          <div className="mt-4">
            <ContactPanel
              token={order.public_token}
              availableAt={availableAt}
              alreadySent={Boolean(lastMessageAt)}
            />
          </div>
        ) : null}
      </section>

      {shown.length > 0 ? (
        <section aria-labelledby="sims" className="mt-10">
          <h2 id="sims" className="text-xl font-semibold">
            Your{" "}
            {esim
              ? shown.length > 1
                ? "eSIMs"
                : "eSIM"
              : shown.length > 1
                ? "SIM cards"
                : "SIM card"}
          </h2>
          <ul className="mt-4 grid gap-4">
            {shown.map((item) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  esim={esim}
                  title={itemTitle(item, unit, items.length)}
                  status={customerItemStatus(item.owner, item)}
                />
              </li>
            ))}
          </ul>
          {pendingReplacements.length > 0 ? (
            <p className="mt-4 flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse"
              />
              Replacement for {unit} {pendingReplacements.join(", ")} is
              processing. It appears here when ready.
            </p>
          ) : null}
        </section>
      ) : null}

      {esim && delivered.length > 0 ? <InstallSteps /> : null}

      <section aria-labelledby="summary" className="mt-10">
        <h2 id="summary" className="text-xl font-semibold">
          Order details
        </h2>
        <DetailList className="mt-4">
          <DetailRow label="Order number" value={orderLabel(order)} mono />
          <DetailRow label="Placed" value={formatDateTime(order.created_at)} />
          <DetailRow
            label="Plan"
            value={`${order.carrier_name} ${order.plan_name}`}
          />
          <DetailRow label="Length" value={formatDays(order.days)} />
          <DetailRow label="Quantity" value={String(order.quantity)} mono />
          {order.area_code ? (
            <DetailRow
              label="Requested area code"
              value={order.area_code}
              mono
            />
          ) : null}
          {order.shipping_address ? (
            <DetailRow
              label="Delivery address"
              value={[
                order.shipping_address.line1,
                order.shipping_address.line2,
                `${order.shipping_address.city}, ${order.shipping_address.state} ${order.shipping_address.zip}`,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          ) : null}
          {order.product_type === "physical" && order.plan_start ? (
            <DetailRow label="Plan starts" value={planStartLabel(order)} />
          ) : null}
          {orderLines(order).map((l) => (
            <DetailRow
              key={l.key}
              label={l.label}
              value={formatPrice(l.cents)}
              mono
            />
          ))}
          <DetailRow
            label="Total"
            value={formatPrice(order.total_cents)}
            mono
            strong
          />
        </DetailList>
      </section>

      {delivered.length > 0 || tickets.length > 0 ? (
        <section aria-labelledby="support" className="mt-10">
          <h2 id="support" className="text-xl font-semibold">
            Help with this order
          </h2>

          {tickets.length > 0 ? (
            <ul className="mt-4 divide-y rounded-xl border bg-card">
              {tickets.map((t) => (
                <li key={t.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{t.type_name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        <span className="tabular font-mono">#{t.number}</span>,{" "}
                        {severityLabel[t.severity].toLowerCase()} priority,{" "}
                        {formatDateTime(t.created_at)}
                      </p>
                    </div>
                    <TicketStatusTag status={t.status} />
                  </div>
                  {t.answer ? (
                    <div className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
                      <p className="mb-1 text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
                        Our answer
                      </p>
                      <p className="whitespace-pre-line">{t.answer}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {ticketItems.length > 0 && ticketTypes.length > 0 ? (
            <div className="mt-4">
              <SupportPanel
                submit={createTicket.bind(null, order.public_token)}
                orderLabel={orderLabel(order)}
                types={ticketTypes}
                items={ticketItems}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

/**
 * Where the order is, at a glance. eSIM: Placed, Processing, Delivered. Physical SIM:
 * Placed, Processing, Shipped, Delivered (line active). Physical orders shipped before
 * the activation step existed end at Shipped.
 */
function Progress({ order, status }: { order: Order; status: CustomerStatus }) {
  const physical = order.product_type === "physical"
  const legacy =
    physical && order.phase === "fulfil" && order.status === "fulfilled"
  const labels: string[] =
    physical && !legacy
      ? ["Placed", "Processing", "Shipped", "Delivered"]
      : ["Placed", "Processing", physical ? "Shipped" : "Delivered"]
  const reached = Math.max(1, labels.indexOf(status))
  const times: Record<string, string> = {
    Placed: formatDateTime(order.created_at),
    Shipped: formatDateTime(
      order.shipped_at ?? (legacy ? order.fulfilled_at : null)
    ),
    Delivered: formatDateTime(
      order.status === "fulfilled" ? order.fulfilled_at : null
    ),
  }
  const steps = labels.map((label, i) => ({
    label,
    time: i <= reached ? (times[label] ?? "") : "",
    state:
      i < reached || (i === reached && label !== "Processing")
        ? ("done" as const)
        : i === reached
          ? ("current" as const)
          : ("todo" as const),
  }))
  return (
    <ol
      className={cn("grid", steps.length === 4 ? "grid-cols-4" : "grid-cols-3")}
    >
      {steps.map((step, i) => (
        <li
          key={step.label}
          aria-current={step.state === "current" ? "step" : undefined}
          className="relative flex flex-col items-start"
        >
          {i < steps.length - 1 ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-3 right-0 left-6 h-px",
                steps[i + 1].state === "todo" ? "bg-border" : "bg-brand"
              )}
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              "relative z-10 flex size-6 items-center justify-center rounded-full",
              step.state === "done" && "bg-brand text-brand-foreground",
              step.state === "current" &&
                "bg-card ring-2 ring-brand ring-inset",
              step.state === "todo" && "bg-card ring-1 ring-border ring-inset"
            )}
          >
            {step.state === "done" ? (
              <CheckIcon weight="bold" className="size-3.5" />
            ) : null}
            {step.state === "current" ? (
              <span className="size-2 rounded-full bg-brand motion-safe:animate-pulse" />
            ) : null}
          </span>
          {/* Four steps on a phone: smaller type so labels never run into each other. */}
          <span
            className={cn(
              "mt-3 pr-1 font-medium",
              steps.length === 4 ? "text-xs sm:text-sm" : "text-sm",
              step.state === "todo" && "text-muted-foreground"
            )}
          >
            {step.label}
          </span>
          <span className="mt-0.5 min-h-4 text-xs text-muted-foreground">
            {step.time}
          </span>
          <span className="sr-only">
            {step.state === "done"
              ? "done"
              : step.state === "current"
                ? "in progress"
                : "next"}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A posted SIM card whose line has not started yet. With "When I receive my SIM" the
 * customer presses the button once it arrives; with a date it starts by itself.
 */
function ActivationPanel({
  token,
  activation: a,
  single,
}: {
  token: string
  activation: Activation
  single: boolean
}) {
  const prefix = single ? "" : `${a.label}: `
  if (a.requested) {
    return (
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="flex items-center gap-3 font-semibold">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse"
          />
          {prefix}Your line is starting up
        </p>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          Your phone number appears here once the line is active, and we email
          it to you. This page updates on its own.
        </p>
      </div>
    )
  }
  if (a.start === "on_date") {
    return (
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="font-semibold">
          {prefix}Your line starts{" "}
          {planStartLabel({
            plan_start: "on_date",
            activate_on: a.activateOn,
          }).replace(/^On /, "on ")}
        </p>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          Your plan days count from then. Your phone number appears here once
          the line is active, and we email it to you.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <p className="font-semibold">{prefix}Got your SIM?</p>
      <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
        Press this once the SIM card is in your hands. Your plan days start from
        activation, so wait until it has arrived. You can press it once.
      </p>
      <form
        action={requestActivation.bind(null, token, a.orderId)}
        className="mt-5"
      >
        <ActivateButton />
      </form>
    </div>
  )
}

function itemTitle(item: CustomerItem, unit: string, count: number) {
  if (item.replacement)
    return `${unit} ${item.replaces_seq ?? ""} replacement`.replace("  ", " ")
  return count > 1 ? `${unit} ${item.seq}` : `Your ${unit}`
}

function ItemCard({
  item,
  esim,
  title,
  status,
}: {
  item: CustomerItem
  esim: boolean
  title: string
  status: CustomerStatus
}) {
  const replaced = item.status === "replaced"
  return (
    <article
      className={cn("rounded-xl border bg-card", replaced && "bg-transparent")}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3
          className={cn(
            "font-sans text-base font-semibold tracking-normal",
            replaced && "text-muted-foreground"
          )}
        >
          {title}
        </h3>
        {replaced ? (
          <Tag tone="neutral">Replaced</Tag>
        ) : (
          <StatusTag status={status} />
        )}
      </div>
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6">
        {esim ? (
          replaced ? (
            <div className="flex h-24 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground sm:size-36 sm:flex-col">
              <QrCodeIcon className="size-5" />
              No longer valid
            </div>
          ) : item.qr_url ? (
            <div className="shrink-0 max-sm:self-center">
              <a
                href={item.qr_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open the QR code for ${title} full size`}
                className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {/* Signed, short-lived URL: next/image would cache it under a public key. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.qr_url}
                  alt={`eSIM QR code for ${title}`}
                  width={208}
                  height={208}
                  className="size-52 rounded-lg border bg-white object-contain p-2.5"
                />
              </a>
              <a
                href={item.qr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open full size <ArrowSquareOutIcon className="size-3" />
              </a>
            </div>
          ) : null
        ) : (
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted"
          >
            <PackageIcon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <dl className="divide-y">
            {item.phone_number ? (
              <Fact
                label="Phone number"
                value={item.phone_number}
                copy={!replaced}
              />
            ) : null}
            {item.iccid ? (
              <Fact label="ICCID" value={item.iccid} copy={!replaced} />
            ) : null}
            {item.tracking_number ? (
              <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    USPS tracking
                  </dt>
                  <dd className="tabular mt-0.5 font-mono text-sm font-medium break-all">
                    {item.tracking_number}
                  </dd>
                </div>
                <a
                  href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(item.tracking_number)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Track
                  <ArrowSquareOutIcon className="size-4" />
                </a>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {replaced
              ? "This line was replaced. Use the replacement above."
              : esim
                ? "Keep this QR code private: anyone who scans it can install your line."
                : null}
          </p>
        </div>
      </div>
    </article>
  )
}

function Fact({
  label,
  value,
  copy,
}: {
  label: string
  value: string
  copy?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="tabular mt-0.5 font-mono text-sm font-medium break-all">
          {value}
        </dd>
      </div>
      {copy ? <CopyButton value={value} label={label.toLowerCase()} /> : null}
    </div>
  )
}

function InstallSteps() {
  const steps = {
    iPhone: [
      "Connect to Wi-Fi.",
      "Open Settings, then Cellular, then Add eSIM.",
      "Choose Use QR Code and scan the code above.",
      "When you land, turn on the line and data roaming.",
    ],
    Android: [
      "Connect to Wi-Fi.",
      "Open Settings, then Connections, then SIM manager.",
      "Tap Add eSIM and scan the code above.",
      "When you land, turn on the line and data roaming.",
    ],
  }
  return (
    <section aria-labelledby="install" className="mt-10">
      <h2 id="install" className="text-xl font-semibold">
        Install your eSIM
      </h2>
      <div className="mt-4 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
        {Object.entries(steps).map(([os, list]) => (
          <div key={os} className="bg-card p-5">
            <p className="font-medium">{os}</p>
            <ol className="mt-3 space-y-2 text-sm">
              {list.map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span
                    aria-hidden
                    className="tabular font-mono text-xs leading-5 text-copper-ink"
                  >
                    {i + 1}
                  </span>
                  <span className="text-foreground/80">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Only one phone? Open this page on another screen to scan, or save the QR
        image and use Add eSIM, then Use photo.
      </p>
    </section>
  )
}

/**
 * An order waiting for its crypto payment. The order reaches the queue only once the
 * provider confirms the payment, so this page never says Processing before then.
 */
function PaymentPanel({
  order,
  returned,
}: {
  order: Order
  returned: boolean
}) {
  const total = formatPrice(order.total_cents)
  if (
    order.payment_status === "confirming" ||
    (returned && order.payment_status === "awaiting")
  ) {
    return (
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="flex items-center gap-3 text-lg font-semibold">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse"
          />
          {order.payment_status === "confirming"
            ? "Payment received, confirming"
            : "Checking your payment"}
        </p>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          Your order starts as soon as the network confirms the payment. That
          usually takes a few minutes for USDT and can take up to an hour for
          Bitcoin. This page updates on its own, and we email{" "}
          {order.customer_email} once it is confirmed.
        </p>
        {order.payment_status === "awaiting" ? (
          <form
            action={startPayment.bind(null, order.public_token)}
            className="mt-4"
          >
            <p className="mb-3 text-sm text-muted-foreground">
              Did not pay after all?
            </p>
            <PayButton label={`Pay ${total}`} />
          </form>
        ) : null}
      </div>
    )
  }
  if (order.payment_status === "partially_paid") {
    return (
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="text-lg font-semibold">We received less than the total</p>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          Your payment arrived but was below the order total of {total}, so your
          order has not started yet. We will email {order.customer_email} about
          the difference. Please do not send another payment until we do.
        </p>
      </div>
    )
  }
  const copy =
    order.payment_status === "expired"
      ? {
          title: "Your payment window closed",
          body: "No payment arrived in time, so the last payment page expired. Open a new one below: the price of your order stays the same.",
        }
      : order.payment_status === "failed"
        ? {
            title: "Your payment did not go through",
            body: "Our payment partner could not complete the last payment. Try again below: the price of your order stays the same.",
          }
        : {
            title: "Pay to start your order",
            body: "Pay with USDT on the TRC-20 network, or with Bitcoin, on our payment partner's secure page. Your order starts as soon as the payment is confirmed.",
          }
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <p className="text-lg font-semibold">{copy.title}</p>
      <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
        {copy.body}
      </p>
      <form
        action={startPayment.bind(null, order.public_token)}
        className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3"
      >
        <PayButton label={`Pay ${total}`} />
        <span className="text-sm text-muted-foreground">
          USDT (TRC-20) or Bitcoin
        </span>
      </form>
    </div>
  )
}

function StatusTag({ status }: { status: CustomerStatus }) {
  const tone =
    status === "Processing" || status === "Shipped"
      ? "brand"
      : status === "Cancelled"
        ? "neutral"
        : "success"
  return <Tag tone={tone}>{status}</Tag>
}

function OrderSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-10 w-2/3" />
      <Skeleton className="mt-8 h-36 rounded-xl" />
      <Skeleton className="mt-10 h-56 rounded-xl" />
    </div>
  )
}
