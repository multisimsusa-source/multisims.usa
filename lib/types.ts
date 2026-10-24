export type ProductType = "esim" | "physical"
export type FulfilmentMode = "manual" | "api"
export type UserRole = "admin" | "agent" | "dealer"

export type Carrier = {
  id: string
  name: string
  slug: string
  logo_path: string | null
  display_order: number
  fulfilment_mode: FulfilmentMode
  active: boolean
}

export type DayPackage = {
  id: string
  plan_id: string
  days: number
  price_cents: number
  /** On sale when set: charged instead of price_cents, which shows struck through. */
  sale_price_cents: number | null
  wholesale_price_cents: number | null
  active: boolean
}

export type Plan = {
  id: string
  carrier_id: string
  name: string
  slug: string
  product_type: ProductType
  talk: string
  sms: string
  data_gb: number | null
  hotspot_gb: number | null
  network: string
  slowdown_after_gb: number | null
  slowdown_speed: string | null
  countries_covered: string[]
  summary: string
  description: string
  published: boolean
  display_order: number
  updated_at: string
}

export type Addon = {
  id: string
  code: string
  name: string
  description: string
  price_cents: number
  wholesale_price_cents: number | null
  active: boolean
}

export type Profile = {
  id: string
  role: UserRole
  full_name: string
  email: string
  active: boolean
}

/** A published plan as the public site sees it. */
export type CatalogPlan = Plan & {
  carrier: Pick<Carrier, "id" | "name" | "slug" | "logo_path">
  /** price_cents is what the buyer pays (the sale price when on sale). */
  packages: (Pick<DayPackage, "id" | "days" | "price_cents"> & { regular_price_cents: number | null })[]
  from_price_cents: number
  /** At least one package is on sale. */
  on_sale: boolean
}

export type OrderStatus =
  | "awaiting_payment"
  | "awaiting_approval"
  | "queued"
  | "claimed"
  | "needs_attention"
  | "shipped"
  | "fulfilled"
  | "cancelled"
export type PaymentStatus =
  | "awaiting"
  | "confirming"
  | "paid"
  | "partially_paid"
  | "expired"
  | "failed"
  | "not_required"
export type ItemStatus = "pending" | "fulfilled" | "replaced" | "cancelled"
export type TicketSeverity = "low" | "medium" | "high" | "urgent"
export type TicketStatus = "open" | "in_progress" | "resolved"

export type PlanStart = "on_receipt" | "on_date"
export type OrderPhase = "fulfil" | "activate"

export type ShippingAddress = { line1: string; line2?: string; city: string; state: string; zip: string }

export type Order = {
  id: string
  number: number
  public_token: string
  channel: "website" | "dealer"
  status: OrderStatus
  payment_status: PaymentStatus
  customer_name: string
  customer_email: string
  customer_phone: string
  zip_code: string | null
  area_code: string | null
  shipping_address: ShippingAddress | null
  carrier_id: string | null
  plan_id: string | null
  day_package_id: string | null
  addon_id: string | null
  carrier_name: string
  plan_name: string
  product_type: ProductType
  days: number
  addon_name: string | null
  quantity: number
  unit_price_cents: number
  addon_price_cents: number
  shipping_cents: number
  /** Per physical SIM card, copied from settings at purchase. */
  sim_card_price_cents: number
  /** Flat, once per order. */
  network_fee_cents: number
  total_cents: number
  /** Physical SIMs: when the plan should start. */
  plan_start: PlanStart | null
  activate_on: string | null
  /** Physical SIMs go through the queue twice: post the cards, then start the lines. */
  phase: OrderPhase
  shipped_at: string | null
  activation_requested_at: string | null
  claimed_by: string | null
  claimed_at: string | null
  attention_reason: string | null
  staff_note: string | null
  paid_at: string | null
  fulfilled_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  refunded_at: string | null
  refund_note: string | null
  replacement_of: string | null
  replaces_item_id: string | null
  ticket_id: string | null
  /** Dealer orders: the bulk order this line belongs to, and the dealer. */
  batch_id: string | null
  dealer_id: string | null
  /** Website discount code, as typed when the order was placed, and what it took off. */
  discount_code_id: string | null
  discount_code: string | null
  discount_cents: number
  created_at: string
  updated_at: string
}

export type OrderItem = {
  id: string
  order_id: string
  seq: number
  status: ItemStatus
  phone_number: string | null
  iccid: string | null
  qr_path: string | null
  tracking_number: string | null
  fulfilled_at: string | null
  fulfilled_by: string | null
  replaced_at: string | null
  replaced_by_item: string | null
}

export type Payment = {
  id: string
  order_id: string | null
  /** An invoice pays for an order, or tops up a dealer's wallet. */
  kind: "order" | "wallet_topup"
  dealer_id: string | null
  provider: string
  provider_invoice_id: string | null
  provider_payment_id: string | null
  invoice_url: string | null
  status: PaymentStatus
  provider_status: string | null
  price_cents: number
  pay_currency: string | null
  pay_amount: string | null
  actually_paid: string | null
  overpaid: boolean
  created_at: string
}

export type TicketType = { id: string; name: string; display_order: number; active: boolean }

export type Ticket = {
  id: string
  number: number
  order_id: string
  order_item_id: string | null
  ticket_type_id: string | null
  type_name: string
  severity: TicketSeverity
  description: string
  screenshot_path: string | null
  status: TicketStatus
  answer: string | null
  answered_by: string | null
  answered_at: string | null
  created_at: string
}

export type Settings = {
  owner_email: string | null
  unclaimed_alert_minutes: number
  shipping_fee_cents: number
  replacement_needs_approval: boolean
  max_replacements_per_order: number
  sim_card_price_cents: number
  network_fee_cents: number
  min_order_cents: number
  /** Dealer price per physical SIM card, unless the dealer has their own. */
  dealer_sim_card_price_cents: number
}
