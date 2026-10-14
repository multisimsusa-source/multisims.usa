import "server-only"

import { sendEmail, type EmailAttachment } from "@/lib/email"
import {
  orderConfirmationEmail,
  orderDeliveredEmail,
  paymentPendingEmail,
  staffCustomerMessageEmail,
  staffNewOrderEmail,
  staffNewTicketEmail,
  staffPaymentIssueEmail,
  ticketAnsweredEmail,
  type DeliveredItem,
  type PaymentIssue,
} from "@/lib/emails"
import type { PaymentEvent } from "@/lib/payments/provider"
import { absoluteUrl } from "@/lib/site"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order, OrderItem, Ticket } from "@/lib/types"

/**
 * Who hears about what. Every function is safe to call twice: a row in order_alerts
 * marks a one-time email as sent, so retries and duplicate webhooks never double-send.
 * Email failures are logged and never break the order flow.
 */

export function orderPageUrl(order: Pick<Order, "public_token">) {
  return absoluteUrl(`/order/${order.public_token}`)
}

/** Owner (settings, or CONTACT_TO_EMAIL as a fallback) plus every active agent. */
export async function staffRecipients({ agents = true } = {}) {
  const db = createServiceClient()
  const [{ data: settings }, { data: staff }] = await Promise.all([
    db.from("settings").select("owner_email").maybeSingle(),
    agents
      ? db.from("profiles").select("email").eq("role", "agent").eq("active", true)
      : Promise.resolve({ data: [] as { email: string }[] }),
  ])
  const owner = settings?.owner_email || process.env.CONTACT_TO_EMAIL || ""
  const list = [...owner.split(","), ...(staff ?? []).map((s) => s.email)].map((e) => e.trim().toLowerCase()).filter(Boolean)
  return [...new Set(list)]
}

/** Records a one-time alert. Returns false when it was already sent. */
async function once(orderId: string, kind: string) {
  const db = createServiceClient()
  const { error } = await db.from("order_alerts").insert({ order_id: orderId, kind })
  return !error
}

async function loadOrder(orderId: string) {
  const db = createServiceClient()
  const { data } = await db.from("orders").select("*").eq("id", orderId).single()
  return data as Order | null
}

/** Order placed and in the queue: customer confirmation, plus the new-order alert to every agent. */
export async function notifyOrderPaid(orderId: string) {
  const order = await loadOrder(orderId)
  if (!order || !(await once(orderId, "paid"))) return
  const confirmation = orderConfirmationEmail(order, orderPageUrl(order))
  await Promise.all([
    sendEmail({ sender: "orders", to: order.customer_email, ...confirmation, idempotencyKey: `paid-${order.id}` }),
    notifyNewOrderToStaff(order),
  ])
}

/** Order placed, payment not confirmed yet: the order page link, in case the buyer closes the payment page. */
export async function notifyAwaitingPayment(orderId: string) {
  const order = await loadOrder(orderId)
  if (!order || !(await once(orderId, "placed"))) return
  const mail = paymentPendingEmail(order, orderPageUrl(order))
  await sendEmail({ sender: "orders", to: order.customer_email, ...mail, idempotencyKey: `placed-${order.id}` })
}

/** Underpaid, overpaid, or paid after cancelling: the owner decides. Once per order and kind. */
export async function notifyPaymentIssue(orderId: string, issue: PaymentIssue, event: PaymentEvent) {
  const order = await loadOrder(orderId)
  if (!order || !(await once(orderId, `payment-${issue}`))) return
  const to = await staffRecipients({ agents: false })
  if (!to.length) return
  const coin = event.payCurrency?.toUpperCase() ?? ""
  const detail: [string, string][] = [
    ["Expected", event.payAmount !== null ? `${event.payAmount} ${coin}` : "Unknown"],
    ["Received", event.actuallyPaid !== null ? `${event.actuallyPaid} ${coin}` : "Unknown"],
    ["Payment reference", event.providerPaymentId ?? "Unknown"],
  ]
  const mail = staffPaymentIssueEmail(order, issue, detail, absoluteUrl(`/admin/orders/${order.id}`))
  await Promise.all(to.map((address) => sendEmail({ sender: "orders", to: address, ...mail, idempotencyKey: `payment-${issue}-${order.id}-${address}` })))
}

/** A job entered the queue (paid order, or approved replacement). */
export async function notifyNewOrderToStaff(order: Order, { activation = false } = {}) {
  const to = await staffRecipients()
  if (!to.length) return
  const mail = staffNewOrderEmail(order, absoluteUrl("/agent"), { activation })
  const key = activation ? "activate" : "queued"
  // Separate sends so agents never see each other's addresses.
  await Promise.all(to.map((address) => sendEmail({ sender: "orders", to: address, ...mail, idempotencyKey: `${key}-${order.id}-${address}` })))
}

/** The customer says their SIM arrived: the same alert as a new order, once. */
export async function notifyActivationRequested(order: Order) {
  if (!(await once(order.id, "activation"))) return
  await notifyNewOrderToStaff(order, { activation: true })
}

/**
 * Delivered (eSIM QR codes inline), shipped (tracking), or a physical SIM's line now
 * active (phone number). Replacements email too.
 */
export async function notifyOrderDelivered(orderId: string) {
  const order = await loadOrder(orderId)
  const kind = order?.product_type === "physical" && order.status === "fulfilled" && order.phase === "activate" ? "activated" : "delivered"
  if (!order || !(await once(orderId, kind))) return
  const db = createServiceClient()
  const { data: rows } = await db.from("order_items").select("*").eq("order_id", orderId).order("seq")
  const items = (rows ?? []) as OrderItem[]

  // A replacement is shown on the original order's page.
  let pageOrder: Pick<Order, "public_token"> = order
  if (order.replacement_of) {
    const original = await loadOrder(order.replacement_of)
    if (original) pageOrder = original
  }

  const attachments: EmailAttachment[] = []
  const delivered: DeliveredItem[] = []
  for (const item of items) {
    let qrCid: string | undefined
    if (order.product_type === "esim" && item.qr_path) {
      const { data: file } = await db.storage.from("esim-qr").download(item.qr_path)
      if (file) {
        qrCid = `qr-${item.seq}`
        attachments.push({
          filename: `esim-${order.number}-${item.seq}.${extension(file.type)}`,
          content: Buffer.from(await file.arrayBuffer()).toString("base64"),
          contentType: file.type || "image/png",
          contentId: qrCid,
        })
      }
    }
    delivered.push({ seq: item.seq, phone_number: item.phone_number, iccid: item.iccid, tracking_number: item.tracking_number, qrCid })
  }

  const mail = orderDeliveredEmail(order, delivered, orderPageUrl(pageOrder), { replacement: Boolean(order.replacement_of) })
  await sendEmail({ sender: "orders", to: order.customer_email, ...mail, attachments, idempotencyKey: `${kind}-${order.id}` })
}

/** The contact button on a slow order page. Owner and every agent. */
export async function notifyCustomerMessage(order: Order, message: string) {
  const to = await staffRecipients()
  const mail = staffCustomerMessageEmail(order, message, absoluteUrl(`/admin/orders/${order.id}`))
  await Promise.all(to.map((address) => sendEmail({ sender: "orders", to: address, replyTo: order.customer_email, ...mail })))
}

export async function notifyNewTicket(order: Order, ticket: Ticket) {
  const to = await staffRecipients()
  const mail = staffNewTicketEmail(order, ticket, absoluteUrl(`/agent/tickets/${ticket.id}`))
  await Promise.all(to.map((address) => sendEmail({ sender: "orders", to: address, replyTo: order.customer_email, ...mail })))
}

export async function notifyTicketAnswered(ticket: Ticket) {
  const order = await loadOrder(ticket.order_id)
  if (!order) return
  const mail = ticketAnsweredEmail(order, ticket, orderPageUrl(order))
  await sendEmail({ sender: "orders", to: order.customer_email, ...mail })
}

function extension(type: string) {
  if (type === "image/jpeg") return "jpg"
  if (type === "image/webp") return "webp"
  return "png"
}
