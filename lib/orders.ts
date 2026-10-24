import type { ItemStatus, Order, OrderItem, OrderStatus, PaymentStatus, TicketSeverity, TicketStatus } from "@/lib/types"

/** Most SIMs one website order can hold. Dealers order in bulk through their portal. */
export const MAX_QUANTITY = 10

export function orderLabel(order: Pick<Order, "number">) {
  return `MS-${order.number}`
}

/** Parses "MS-10421", "ms10421" or "10421" into the order number. */
export function parseOrderLabel(value: string): number | null {
  const m = value.trim().match(/^(?:ms-?)?(\d{4,9})$/i)
  return m ? Number(m[1]) : null
}

export type CustomerStatus = "Processing" | "Delivered" | "Shipped" | "Cancelled"

type StatusSource = Pick<Order, "status" | "product_type" | "phase">

/**
 * What the customer sees. Only Processing, Shipped and Delivered (plus Cancelled once
 * the owner cancels): nothing may suggest a person fills orders. An unpaid order is
 * Processing too; its page asks for the payment.
 *
 * Physical SIMs: Shipped once posted, Delivered once the line is active. Orders shipped
 * before the activation step existed (phase 'fulfil', fulfilled) stay Shipped.
 */
export function customerOrderStatus(order: StatusSource): CustomerStatus {
  if (order.status === "cancelled") return "Cancelled"
  if (order.product_type === "esim") return order.status === "fulfilled" ? "Delivered" : "Processing"
  if (order.phase === "activate") return order.status === "fulfilled" ? "Delivered" : "Shipped"
  return order.status === "fulfilled" ? "Shipped" : "Processing"
}

/** One SIM, judged by the order it belongs to (a replacement has its own order). */
export function customerItemStatus(order: StatusSource, item: Pick<OrderItem, "status">): CustomerStatus {
  if (order.status === "cancelled" || item.status === "cancelled") return "Cancelled"
  if (item.status === "pending") return "Processing"
  const status = customerOrderStatus(order)
  return status === "Processing" ? "Shipped" : status
}

/** "When the SIM arrives" or "On Oct 20, 2026". */
export function planStartLabel(order: Pick<Order, "plan_start" | "activate_on">) {
  if (order.plan_start === "on_date" && order.activate_on) {
    const d = new Date(`${order.activate_on}T12:00:00Z`)
    return `On ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(d)}`
  }
  return "When the SIM arrives"
}

/** Internal labels for staff screens. */
export const orderStatusLabel: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  awaiting_approval: "Awaiting approval",
  queued: "In queue",
  claimed: "Claimed",
  needs_attention: "Needs attention",
  shipped: "Shipped, not active",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger"

/** Tone for what the customer (or dealer) sees: in progress is brand, done is success. */
export const customerStatusTone: Record<CustomerStatus, Tone> = {
  Processing: "brand",
  Shipped: "brand",
  Delivered: "success",
  Cancelled: "neutral",
}

/** Internal payment labels for staff screens. */
export const paymentStatusLabel: Record<PaymentStatus, string> = {
  awaiting: "Not paid",
  confirming: "Confirming",
  paid: "Paid",
  partially_paid: "Underpaid",
  expired: "Expired",
  failed: "Failed",
  not_required: "No payment",
}

export const paymentStatusTone: Record<PaymentStatus, Tone> = {
  awaiting: "neutral",
  confirming: "brand",
  paid: "success",
  partially_paid: "danger",
  expired: "neutral",
  failed: "danger",
  not_required: "neutral",
}

export const orderStatusTone: Record<OrderStatus, Tone> = {
  awaiting_payment: "neutral",
  awaiting_approval: "warning",
  queued: "brand",
  claimed: "brand",
  needs_attention: "danger",
  shipped: "neutral",
  fulfilled: "success",
  cancelled: "neutral",
}

export const itemStatusLabel: Record<ItemStatus, string> = {
  pending: "Pending",
  fulfilled: "Fulfilled",
  replaced: "Replaced",
  cancelled: "Cancelled",
}

export const ticketStatusLabel: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
}

export const ticketStatusTone: Record<TicketStatus, Tone> = {
  open: "warning",
  in_progress: "brand",
  resolved: "success",
}

export const severityLabel: Record<TicketSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

export const severityTone: Record<TicketSeverity, Tone> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  urgent: "danger",
}

/** "4 min", "2 h 5 min", "3 d" since a timestamp. */
export function elapsed(since: string | Date, now: Date = new Date()) {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 48) return mins % 60 ? `${h} h ${mins % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d`
}

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })
const dateTimeShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/** "Oct 10, 8:09 PM" this year, "Oct 10, 2025, 8:09 PM" otherwise. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return ""
  const d = new Date(value)
  return d.getFullYear() === new Date().getFullYear() ? dateTimeShort.format(d) : dateTime.format(d)
}
