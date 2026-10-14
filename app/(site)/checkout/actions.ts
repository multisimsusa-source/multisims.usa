"use server"

import { after } from "next/server"
import { redirect } from "next/navigation"
import { z } from "zod"

import { notifyAwaitingPayment, notifyOrderPaid } from "@/lib/notify"
import { MAX_QUANTITY } from "@/lib/orders"
import { getPaymentProvider, invoiceUrlForOrder, minimumOrderCents } from "@/lib/payments"
import { minimumOrderMessage, orderTotal } from "@/lib/pricing"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order } from "@/lib/types"
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
  plan_start: z.enum(["on_receipt", "on_date"], "Choose when your plan should start"),
  activate_on: z.string(),
})

export type CheckoutField = keyof z.infer<typeof base> | keyof z.infer<typeof address>

/** Today in the US (where lines are activated), as YYYY-MM-DD. */
function usToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}

/** A start date from today up to a year ahead, or an error message. */
function checkStartDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose the date your plan should start"
  const today = usToday()
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCFullYear(limit.getUTCFullYear() + 1)
  if (value < today) return "Choose today or a later date"
  if (value > limit.toISOString().slice(0, 10)) return "Choose a date within the next year"
  return null
}
export type CheckoutState = {
  status: "idle" | "error"
  message?: string
  fieldErrors?: Partial<Record<CheckoutField, string>>
  values?: Record<string, string>
}

/**
 * Places an order. Prices are always re-read from the database, never taken from the
 * form. The order waits for payment and the buyer goes to the provider's payment page;
 * it reaches the agent queue only when the provider's webhook confirms payment. With no
 * provider configured (development), it goes straight to the queue.
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
    db.from("settings").select("shipping_fee_cents, sim_card_price_cents, network_fee_cents, min_order_cents").maybeSingle(),
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
    const a = address.safeParse({ plan_start: "on_receipt", activate_on: "", ...values })
    if (a.success) {
      shipping = a.data
      if (a.data.plan_start === "on_date") {
        const dateError = checkStartDate(a.data.activate_on)
        if (dateError) fieldErrors.activate_on = dateError
      }
    } else for (const issue of a.error.issues) fieldErrors[issue.path[0] as CheckoutField] ??= issue.message
  }

  if (!parsed.success || Object.keys(fieldErrors).length) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors, values }
  }

  const input = parsed.data
  const useAddon = input.intl && addon ? addon : null
  const shippingCents = physical ? (settings?.shipping_fee_cents ?? 0) : 0
  const simCardCents = physical ? (settings?.sim_card_price_cents ?? 0) : 0
  const networkFeeCents = settings?.network_fee_cents ?? 0
  const total = orderTotal({
    unitCents: pkg.price_cents,
    addonCents: useAddon?.price_cents ?? 0,
    quantity: input.quantity,
    physical,
    simCardCents,
    shippingCents,
    networkFeeCents,
  })

  // Below the minimum the payment provider refuses the payment, and a payment it refuses
  // usually cannot be refunded: stop here, before any order or invoice exists.
  const minimum = await minimumOrderCents(settings?.min_order_cents ?? 0)
  if (total < minimum) {
    return { status: "error", message: minimumOrderMessage(minimum), values }
  }

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
      sim_card_price_cents: simCardCents,
      network_fee_cents: networkFeeCents,
      total_cents: total,
      plan_start: shipping ? shipping.plan_start : null,
      activate_on: shipping?.plan_start === "on_date" ? shipping.activate_on : null,
    })
    .select("*")
    .single()
  if (error || !order) {
    console.error("[checkout] order insert failed", error)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const items = Array.from({ length: input.quantity }, (_, i) => ({ order_id: order.id, seq: i + 1 }))
  const { error: itemsError } = await db.from("order_items").insert(items)
  if (itemsError) {
    console.error("[checkout] order items insert failed", itemsError)
    await db.from("orders").delete().eq("id", order.id)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const provider = getPaymentProvider()
  if (!provider) {
    const { error: queueError } = await db.rpc("mark_order_paid", { p_order_id: order.id, p_payment_status: "not_required" })
    if (queueError) {
      console.error("[checkout] could not queue order", queueError)
      await db.from("orders").delete().eq("id", order.id)
      return { status: "error", message: "We could not place your order. Please try again.", values }
    }
    after(() => notifyOrderPaid(order.id))
    redirect(`/order/${order.public_token}?placed=1`)
  }

  after(() => notifyAwaitingPayment(order.id))
  let invoiceUrl: string | null = null
  try {
    invoiceUrl = await invoiceUrlForOrder(provider, order as Order)
  } catch (err) {
    // The order is saved: its page offers the payment again.
    console.error("[checkout] could not open an invoice", err)
  }
  redirect(invoiceUrl ?? `/order/${order.public_token}?pay=error`)
}
