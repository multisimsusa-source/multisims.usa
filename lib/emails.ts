import "server-only"

import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import { orderLabel, planStartLabel } from "@/lib/orders"
import { orderLines } from "@/lib/pricing"
import { site } from "@/lib/site"
import type { Order, OrderItem, Ticket } from "@/lib/types"

/**
 * Email content. Plain, table-based HTML with inline styles (email clients ignore
 * stylesheets), always paired with a text version. Customer wording never suggests a
 * person fills orders: statuses are only Processing, Delivered and Shipped.
 */

const plum = "#3a1039"
const copper = "#a3753f"
const ink = "#2b2230"
const muted = "#6b6170"
const line = "#e6e2ea"

type Rendered = { subject: string; text: string; html: string }

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function layout({ preheader, heading, body, cta }: { preheader: string; heading: string; body: string; cta?: { label: string; url: string } }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f8;color:${ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${line};border-radius:12px;">
<tr><td style="padding:22px 28px;border-bottom:1px solid ${line};">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:${plum};letter-spacing:1px;">MSU</span>
<span style="font-size:11px;font-weight:600;letter-spacing:2px;color:${copper};padding-left:8px;">MULTISIMS.USA</span>
</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${ink};">${esc(heading)}</h1>
${body}
${cta ? `<p style="margin:28px 0 4px;"><a href="${esc(cta.url)}" style="display:inline-block;background:${plum};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${esc(cta.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid ${line};font-size:12px;line-height:1.6;color:${muted};">
${esc(site.name)} &middot; <a href="${esc(site.url)}" style="color:${muted};">${esc(site.domain)}</a>
</td></tr>
</table></td></tr></table></body></html>`
}

function p(text: string) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${text}</p>`
}

function rows(pairs: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;border:1px solid ${line};border-radius:8px;">${pairs
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 14px;font-size:13px;color:${muted};${i ? `border-top:1px solid ${line};` : ""}">${esc(k)}</td><td align="right" style="padding:10px 14px;font-size:14px;${i ? `border-top:1px solid ${line};` : ""}">${esc(v)}</td></tr>`
    )
    .join("")}</table>`
}

function orderRows(order: Order): [string, string][] {
  const out: [string, string][] = [
    ["Order", orderLabel(order)],
    ["Plan", `${order.carrier_name} ${order.plan_name}`],
    ["Product", productTypeLabel[order.product_type]],
    ["Days", formatDays(order.days)],
    ["Quantity", String(order.quantity)],
  ]
  if (order.product_type === "physical" && order.plan_start) out.push(["Plan starts", planStartLabel(order)])
  if (order.total_cents > 0) {
    for (const l of orderLines(order)) out.push([l.label, formatPrice(l.cents)])
    out.push(["Total", formatPrice(order.total_cents)])
  } else if (order.addon_name) out.push([order.addon_name, "Included"])
  return out
}

function textRows(pairs: [string, string][]) {
  return pairs.map(([k, v]) => `${k}: ${v}`).join("\n")
}

// Customer ----------------------------------------------------------------------------

export function orderConfirmationEmail(order: Order, orderUrl: string): Rendered {
  const pairs = orderRows(order)
  const eta =
    order.product_type === "esim"
      ? "Your eSIM QR code will appear on your order page and arrive by email as soon as it is ready."
      : "We will email you the tracking number as soon as your SIM card ships."
  return {
    subject: `Order ${orderLabel(order)} confirmed`,
    text: `Hi ${order.customer_name},\n\nThanks, we have your order and it is processing.\n\n${textRows(pairs)}\n\n${eta}\n\nYour private order page: ${orderUrl}\n\nKeep this link to yourself: anyone with it can see your order.`,
    html: layout({
      preheader: `Order ${orderLabel(order)} is processing.`,
      heading: "Order confirmed",
      body:
        p(`Hi ${esc(order.customer_name)}, thanks for your order. It is processing now.`) +
        rows(pairs) +
        p(esc(eta)) +
        p(`<span style="color:${muted};font-size:13px;">Keep your order link to yourself: anyone with it can see your order.</span>`),
      cta: { label: "View your order", url: orderUrl },
    }),
  }
}

/** Sent when an order is placed but not yet paid, so the buyer can always get back to it. */
export function paymentPendingEmail(order: Order, orderUrl: string): Rendered {
  const pairs = orderRows(order)
  return {
    subject: `Order ${orderLabel(order)}: finish your payment`,
    text: `Hi ${order.customer_name},\n\nWe have your order. It starts as soon as your crypto payment is confirmed.\n\n${textRows(pairs)}\n\nIf you closed the payment page, open your order page to pay: ${orderUrl}\n\nKeep this link to yourself: anyone with it can see your order.`,
    html: layout({
      preheader: `Order ${orderLabel(order)} starts once your payment is confirmed.`,
      heading: "Finish your payment",
      body:
        p(`Hi ${esc(order.customer_name)}, we have your order. It starts as soon as your crypto payment is confirmed.`) +
        rows(pairs) +
        p("If you closed the payment page, open your order page to pay. If you have already paid, there is nothing more to do: we email you once the payment is confirmed.") +
        p(`<span style="color:${muted};font-size:13px;">Keep your order link to yourself: anyone with it can see your order.</span>`),
      cta: { label: "Open your order page", url: orderUrl },
    }),
  }
}

export type DeliveredItem = Pick<OrderItem, "seq" | "phone_number" | "iccid" | "tracking_number"> & { qrCid?: string }

export function orderDeliveredEmail(order: Order, items: DeliveredItem[], orderUrl: string, opts: { replacement?: boolean } = {}): Rendered {
  const esim = order.product_type === "esim"
  // Physical SIMs get two emails: shipped (tracking), then active (phone number).
  const active = !esim && order.status === "fulfilled" && order.phase === "activate"
  const heading = active
    ? opts.replacement
      ? "Your replacement SIM card is active"
      : items.length > 1
        ? "Your SIM cards are active"
        : "Your SIM card is active"
    : opts.replacement
      ? esim
        ? "Your replacement eSIM is ready"
        : "Your replacement SIM card has shipped"
      : esim
        ? items.length > 1
          ? "Your eSIMs are ready"
          : "Your eSIM is ready"
        : "Your SIM card has shipped"
  const shippedNext =
    order.plan_start === "on_date" && order.activate_on
      ? `Your line starts ${planStartLabel(order).replace(/^On /, "on ")}, and we email you its phone number then.`
      : "When it arrives, open your order page and press \"My SIM has arrived, activate it\". Your plan days start from then."

  const itemBlocks = items.map((item) => {
    const pairs: [string, string][] = []
    if (item.phone_number) pairs.push(["Phone number", item.phone_number])
    if (item.iccid) pairs.push(["ICCID", item.iccid])
    if (item.tracking_number && !active) pairs.push(["Tracking number", item.tracking_number])
    const title = items.length > 1 ? `${esim ? "eSIM" : "SIM"} ${item.seq}` : ""
    return { title, pairs, qrCid: item.qrCid }
  })

  const install = esim
    ? "To install: on your phone open Settings, then Cellular (iPhone) or Connections (Android), choose Add eSIM, and scan the QR code. Install it while you have Wi-Fi, and keep the line switched off until you land in the US if your plan starts on first use."
    : active
      ? "Insert the SIM, restart your phone, and turn on the line. Your plan days count from today."
      : `Tracking can take a few hours to show movement after the label is created. ${shippedNext}`

  const html = layout({
    preheader: esim ? "Scan the QR code to install your line." : active ? "Your phone number is inside." : "Your tracking number is inside.",
    heading,
    body:
      p(`Hi ${esc(order.customer_name)}, order ${esc(orderLabel(order))} is ${esim ? "delivered" : active ? "active" : "on its way"}.`) +
      itemBlocks
        .map(
          (b) =>
            `${b.title ? `<p style="margin:18px 0 6px;font-size:13px;font-weight:600;color:${muted};text-transform:uppercase;letter-spacing:1px;">${esc(b.title)}</p>` : ""}` +
            (b.qrCid
              ? `<p style="margin:8px 0;"><img src="cid:${esc(b.qrCid)}" alt="eSIM QR code${b.title ? ` for ${esc(b.title)}` : ""}" width="220" height="220" style="display:block;width:220px;height:220px;border:1px solid ${line};border-radius:8px;"></p>`
              : "") +
            (b.pairs.length ? rows(b.pairs) : "")
        )
        .join("") +
      p(esc(install)) +
      p(`<span style="color:${muted};font-size:13px;">Something not working? Open your order page and use the support form. Never share your QR code: anyone who scans it can install your line.</span>`),
    cta: { label: "Open your order page", url: orderUrl },
  })

  const text = [
    `Hi ${order.customer_name},`,
    "",
    `${heading}. Order ${orderLabel(order)}.`,
    "",
    ...itemBlocks.flatMap((b) => [b.title, textRows(b.pairs), esim ? "QR code: attached, and on your order page." : "", ""].filter(Boolean)),
    install,
    "",
    `Your order page: ${orderUrl}`,
  ].join("\n")

  return { subject: `${heading} (${orderLabel(order)})`, text, html }
}

export function ticketAnsweredEmail(order: Order, ticket: Ticket, orderUrl: string): Rendered {
  const status = ticket.status === "resolved" ? "Resolved" : ticket.status === "in_progress" ? "In progress" : "Open"
  return {
    subject: `Update on your support request #${ticket.number}`,
    text: `Hi ${order.customer_name},\n\nThere is an update on your support request #${ticket.number} for order ${orderLabel(order)}.\n\nStatus: ${status}\n\n${ticket.answer ?? ""}\n\nYour order page: ${orderUrl}`,
    html: layout({
      preheader: `Support request #${ticket.number}: ${status}`,
      heading: "Update on your support request",
      body:
        rows([
          ["Request", `#${ticket.number}`],
          ["Order", orderLabel(order)],
          ["Status", status],
        ]) + (ticket.answer ? p(esc(ticket.answer).replace(/\n/g, "<br>")) : ""),
      cta: { label: "Open your order page", url: orderUrl },
    }),
  }
}

// Staff ---------------------------------------------------------------------------------

export function staffNewOrderEmail(order: Order, workUrl: string, { activation = false } = {}): Rendered {
  const pairs = orderRows(order)
  if (order.area_code) pairs.push(["Area code", order.area_code])
  if (order.zip_code) pairs.push(["ZIP", order.zip_code])
  const what = activation ? "Activate" : order.replacement_of ? "Replacement" : "New order"
  const heading = activation ? "SIM arrived, ready to activate" : `${what} waiting`
  const lead = activation ? "The customer has their SIM. Start the line and add its phone number." : `${what} waiting in the queue.`
  return {
    subject: `${what} ${orderLabel(order)}: ${order.quantity} x ${order.carrier_name} ${order.plan_name}`,
    text: `${lead}\n\n${textRows(pairs)}\n\nClaim it: ${workUrl}`,
    html: layout({
      preheader: `${order.quantity} x ${order.carrier_name} ${order.plan_name}, ${formatDays(order.days)}`,
      heading,
      body: (activation ? p(esc(lead)) : "") + rows(pairs),
      cta: { label: "Open the queue", url: workUrl },
    }),
  }
}

export function staffCustomerMessageEmail(order: Order, message: string, adminUrl: string): Rendered {
  return {
    subject: `Customer waiting on ${orderLabel(order)}`,
    text: `${order.customer_name} <${order.customer_email}> sent a message from the order page.\n\nOrder status: ${order.status}\n\n${message}\n\nOpen the order: ${adminUrl}`,
    html: layout({
      preheader: message.slice(0, 120),
      heading: `Customer waiting on ${orderLabel(order)}`,
      body:
        rows([
          ["Customer", `${order.customer_name} (${order.customer_email})`],
          ["Phone", order.customer_phone],
          ["Status", order.status.replace("_", " ")],
        ]) + p(esc(message).replace(/\n/g, "<br>")),
      cta: { label: "Open the order", url: adminUrl },
    }),
  }
}

export function staffNewTicketEmail(order: Order, ticket: Ticket, url: string): Rendered {
  return {
    subject: `Ticket #${ticket.number} (${ticket.severity}): ${ticket.type_name}, ${orderLabel(order)}`,
    text: `New support ticket.\n\nType: ${ticket.type_name}\nSeverity: ${ticket.severity}\nOrder: ${orderLabel(order)}\nCustomer: ${order.customer_name} <${order.customer_email}>\n\n${ticket.description}\n\nOpen it: ${url}`,
    html: layout({
      preheader: ticket.description.slice(0, 120),
      heading: `New ticket #${ticket.number}`,
      body:
        rows([
          ["Type", ticket.type_name],
          ["Severity", ticket.severity],
          ["Order", orderLabel(order)],
          ["Customer", `${order.customer_name} (${order.customer_email})`],
        ]) + p(esc(ticket.description).replace(/\n/g, "<br>")),
      cta: { label: "Open the ticket", url },
    }),
  }
}

export type PaymentIssue = "underpaid" | "overpaid" | "paid_after_cancel"

const issueText: Record<PaymentIssue, { heading: string; body: string }> = {
  underpaid: {
    heading: "Underpaid",
    body: "The customer sent less than the order total, so the order is not in the queue. Contact the customer about the difference, then use Mark as paid on the order, or cancel it and refund what arrived.",
  },
  overpaid: {
    heading: "Overpaid",
    body: "The customer sent more than the order total. The order is in the queue as normal. Refund the difference from your wallet if the customer asks.",
  },
  paid_after_cancel: {
    heading: "Paid after cancelling",
    body: "A payment completed on an order that was already cancelled. The money is in your wallet but the order is not in the queue. Refund it, or contact the customer.",
  },
}

export function staffPaymentIssueEmail(order: Order, issue: PaymentIssue, detail: [string, string][], adminUrl: string): Rendered {
  const { heading, body } = issueText[issue]
  const pairs: [string, string][] = [
    ["Order", orderLabel(order)],
    ["Customer", `${order.customer_name} (${order.customer_email})`],
    ["Order total", formatPrice(order.total_cents)],
    ...detail,
  ]
  return {
    subject: `${heading}: ${orderLabel(order)}`,
    text: `${heading}: ${orderLabel(order)}\n\n${body}\n\n${textRows(pairs)}\n\nOpen the order: ${adminUrl}`,
    html: layout({
      preheader: body.slice(0, 120),
      heading: `${heading}: ${orderLabel(order)}`,
      body: p(esc(body)) + rows(pairs),
      cta: { label: "Open the order", url: adminUrl },
    }),
  }
}

export function agentWelcomeEmail(name: string, loginUrl: string): Rendered {
  return {
    subject: "Your MultiSims USA agent login",
    text: `Hi ${name},\n\nAn agent login was created for you. Sign in at ${loginUrl} with this email address and the password the owner gave you.\n\nAt the start of each shift, switch on "Enable sound" in the portal so new orders ring.`,
    html: layout({
      preheader: "Sign in to the agent portal.",
      heading: "Your agent login is ready",
      body:
        p(`Hi ${esc(name)}, an agent login was created for you. Sign in with this email address and the password the owner gave you.`) +
        p(`At the start of each shift, switch on <strong>Enable sound</strong> in the portal so new orders ring.`),
      cta: { label: "Sign in", url: loginUrl },
    }),
  }
}
