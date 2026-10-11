"use server"

import { after } from "next/server"
import { redirect } from "next/navigation"
import { z } from "zod"

import { notifyOrderPaid } from "@/lib/notify"
import { MAX_QUANTITY } from "@/lib/orders"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { createServiceClient } from "@/lib/supabase/service"
import { usStateCodes } from "@/lib/us-states"

const base = z.object({
  plan: z.string().min(1).max(120),
  days: z.coerce.number().int().min(1).max(365),
  intl: z.boolean(),
  quantity: z.coerce.number().int().min(1, "At least 1").max(MAX_QUANTITY, `Up to ${MAX_QUANTITY} per order`),
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email address").max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, "Enter a phone number with country code, for example +94 77 123 4567"),
  zip: z.string().trim().regex(/^[0-9]{5}$/, "Enter a 5-digit US ZIP code"),
  area_code: z.union([z.literal(""), z.string().trim().regex(/^[2-9][0-9]{2}$/, "Enter 3 digits, for example 212")]),
})

const address = z.object({
  line1: z.string().trim().min(3, "Enter the street address").max(120),
  line2: z.string().trim().max(120),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().refine((s) => usStateCodes.has(s), "Choose a state"),
  ship_zip: z.string().trim().regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a US ZIP code"),
})

export type CheckoutField = keyof z.infer<typeof base> | keyof z.infer<typeof address>
export type CheckoutState = {
  status: "idle" | "error"
  message?: string
  fieldErrors?: Partial<Record<CheckoutField, string>>
  values?: Record<string, string>
}

/**
 * Places an order. Prices are always re-read from the database, never taken from the
 * form. Version one takes no payment yet: the order goes straight to the agent queue
 * and the customer lands on their private order page.
 */
export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])
  )
  // Honeypot: people never fill this hidden field.
  if (values.company) return { status: "error", message: "Something went wrong. Please try again.", values }

  if (!(await rateLimit(`checkout:${await clientIp()}`, 8, 10 * 60_000)).ok) {
    return { status: "error", message: "Too many orders from this connection. Please wait a few minutes.", values }
  }

  const parsed = base.safeParse({ ...values, intl: values.intl === "on" || values.intl === "1" })
  const fieldErrors: CheckoutState["fieldErrors"] = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as CheckoutField] ??= issue.message
  }

  const db = createServiceClient()
  const slug = values.plan ?? ""
  const [{ data: plan }, { data: settings }, { data: addon }] = await Promise.all([
    db
      .from("plans")
      .select("id, name, product_type, published, carrier:carriers!inner(id, name, active), packages:day_packages(id, days, price_cents, active)")
      .eq("slug", slug)
      .maybeSingle(),
    db.from("settings").select("shipping_fee_cents").maybeSingle(),
    db.from("addons").select("id, name, price_cents").eq("code", "intl_calling").eq("active", true).maybeSingle(),
  ])

  const carrier = plan?.carrier as unknown as { id: string; name: string; active: boolean } | undefined
  const pkg = plan?.packages.find((p) => p.active && p.days === Number(values.days))
  if (!plan || !plan.published || !carrier?.active || !pkg) {
    return { status: "error", message: "This plan or day package is no longer on sale. Go back and choose again.", values }
  }

  const physical = plan.product_type === "physical"
  let shipping: z.infer<typeof address> | null = null
  if (physical) {
    const a = address.safeParse(values)
    if (a.success) shipping = a.data
    else for (const issue of a.error.issues) fieldErrors[issue.path[0] as CheckoutField] ??= issue.message
  }

  if (!parsed.success || Object.keys(fieldErrors).length) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors, values }
  }

  const input = parsed.data
  const useAddon = input.intl && addon ? addon : null
  const shippingCents = physical ? (settings?.shipping_fee_cents ?? 0) : 0
  const total = (pkg.price_cents + (useAddon?.price_cents ?? 0)) * input.quantity + shippingCents

  const { data: order, error } = await db
    .from("orders")
    .insert({
      channel: "website",
      customer_name: input.name,
      customer_email: input.email.toLowerCase(),
      customer_phone: input.phone,
      zip_code: input.zip,
      area_code: input.area_code || null,
      shipping_address: shipping
        ? { line1: shipping.line1, line2: shipping.line2 || undefined, city: shipping.city, state: shipping.state, zip: shipping.ship_zip }
        : null,
      carrier_id: carrier.id,
      plan_id: plan.id,
      day_package_id: pkg.id,
      addon_id: useAddon?.id ?? null,
      carrier_name: carrier.name,
      plan_name: plan.name,
      product_type: plan.product_type,
      days: pkg.days,
      addon_name: useAddon?.name ?? null,
      quantity: input.quantity,
      unit_price_cents: pkg.price_cents,
      addon_price_cents: useAddon?.price_cents ?? 0,
      shipping_cents: shippingCents,
      total_cents: total,
    })
    .select("id, public_token")
    .single()
  if (error || !order) {
    console.error("[checkout] order insert failed", error)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const items = Array.from({ length: input.quantity }, (_, i) => ({ order_id: order.id, seq: i + 1 }))
  const { error: itemsError } = await db.from("order_items").insert(items)
  // No payment step in version one yet: the order goes straight to the queue.
  const { error: queueError } = itemsError
    ? { error: itemsError }
    : await db.rpc("mark_order_paid", { p_order_id: order.id, p_payment_status: "not_required" })
  if (queueError) {
    console.error("[checkout] could not queue order", queueError)
    await db.from("orders").delete().eq("id", order.id)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  after(() => notifyOrderPaid(order.id))
  redirect(`/order/${order.public_token}?placed=1`)
}
