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
