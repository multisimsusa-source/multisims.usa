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
  packages: Pick<DayPackage, "id" | "days" | "price_cents">[]
  from_price_cents: number
}

export type OrderStatus =
  | "awaiting_payment"
  | "awaiting_approval"
  | "queued"
  | "claimed"
  | "needs_attention"
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
  total_cents: number
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
}
