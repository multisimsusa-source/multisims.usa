"use server"

import { after } from "next/server"
import { redirect } from "next/navigation"
import { z } from "zod"

import { findDiscountCode } from "@/lib/discounts"
import { notifyAwaitingPayment, notifyOrderPaid } from "@/lib/notify"
import { getPaymentProvider, invoiceUrlForOrder, minimumOrderCents } from "@/lib/payments"
import { discountableCents, discountFor, minimumOrderMessage, orderTotal, type DiscountRule } from "@/lib/pricing"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order } from "@/lib/types"

const contact = {
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email address").max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, "Enter a phone number with country code, for example +94 77 123 4567"),
}

const iccidRule = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .refine((v) => /^[0-9]{18,22}[Ff]?$/.test(v), "An ICCID is 18 to 22 digits, printed on the SIM card")

const usNumber = z
  .string()
  .trim()
  .refine((v) => {
    const digits = v.replace(/\D/g, "")
    return /^[0-9 ()+.-]+$/.test(v) && (digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))
  }, "Enter the US number, for example (212) 555-0100")

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("refill"),
    line_phone: usNumber,
    iccid: z.union([z.literal(""), iccidRule]),
    ...contact,
  }),
  z.object({
    mode: z.literal("activate"),
    iccid: iccidRule,
    zip: z.string().trim().regex(/^[0-9]{5}$/, "Enter a 5-digit US ZIP code"),
    area_code: z.union([z.literal(""), z.string().trim().regex(/^[2-9][0-9]{2}$/, "Enter 3 digits, for example 212")]),
    ...contact,
  }),
])

// One number per refill, so only the length can grow.
const REFILL_HINT = "Choose a longer plan."

export type RefillField = "line_phone" | "iccid" | "zip" | "area_code" | "name" | "email" | "phone" | "plan"

export type RefillState = {
  status: "idle" | "error"
  message?: string
  fieldErrors?: Partial<Record<RefillField, string>>
  values?: Record<string, string>
}

/**
 * Refill a number, or activate a SIM card bought on its own. One SIM per order, no shipping
 * and no card: the plan (and calling) plus the network fee, less any code. Prices are read
 * here, never taken from the form. Pays like a normal order; the agent queue gets it once paid.
 */
export async function placeRefill(_prev: RefillState, formData: FormData): Promise<RefillState> {
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])
  )
  if (values.company) return { status: "error", message: "Something went wrong. Please try again.", values }
  if (!(await rateLimit(`refill:${await clientIp()}`, 8, 10 * 60_000)).ok) {
    return { status: "error", message: "Too many orders from this connection. Please wait a few minutes.", values }
  }

  const parsed = schema.safeParse({ ...values, iccid: values.iccid ?? "" })
  const fieldErrors: RefillState["fieldErrors"] = {}
  if (!parsed.success) for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as RefillField] ??= issue.message

  const db = createServiceClient()
  const [{ data: plan }, { data: settings }, { data: addon }] = await Promise.all([
    db
      .from("plans")
      .select("id, name, product_type, published, refillable, carrier:carriers!inner(id, name, slug, active), packages:day_packages(id, days, price_cents, sale_price_cents, active)")
      .eq("slug", (values.plan ?? "").slice(0, 120))
      .maybeSingle(),
    db.from("settings").select("network_fee_cents, min_order_cents").maybeSingle(),
    db.from("addons").select("id, name, price_cents").eq("code", "intl_calling").eq("active", true).maybeSingle(),
  ])
  const carrier = plan?.carrier as unknown as { id: string; name: string; slug: string; active: boolean } | undefined
  const pkg = plan?.packages.find((p) => p.active && p.days === Number(values.days))
  if (!plan || !pkg) fieldErrors.plan = "Choose a plan and a length"
  else if (!plan.published || !plan.refillable || !carrier?.active) fieldErrors.plan = "This plan is no longer offered for refills. Choose another plan."
  if (!parsed.success || Object.keys(fieldErrors).length || !plan || !pkg || !carrier) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors, values }
  }

  const input = parsed.data
  const useAddon = (values.intl === "on" || values.intl === "1") && addon ? addon : null
  const unitCents = pkg.sale_price_cents !== null && pkg.sale_price_cents < pkg.price_cents ? pkg.sale_price_cents : pkg.price_cents
  const networkFeeCents = settings?.network_fee_cents ?? 0
  const priceInput = { unitCents, addonCents: useAddon?.price_cents ?? 0, quantity: 1, physical: false, simCardCents: 0 }

  let discount: { id: string; code: string; cents: number } | null = null
  if (values.discount_code?.trim()) {
    const found = await findDiscountCode(values.discount_code, carrier.id)
    if (!found.ok) return { status: "error", message: `${found.error}. Remove it or try another code.`, values }
    discount = { id: found.code.id, code: found.code.code, cents: discountFor(found.code as DiscountRule, discountableCents(priceInput)) }
  }
  const total = orderTotal({ ...priceInput, shippingCents: 0, networkFeeCents, discountCents: discount?.cents ?? 0 })
  const minimum = await minimumOrderCents(settings?.min_order_cents ?? 0)
  if (total < minimum) return { status: "error", message: minimumOrderMessage(minimum, REFILL_HINT), values }

  const refill = input.mode === "refill"
  const linePhone = refill ? input.line_phone : null
  const iccid = input.iccid || null
  const { data: order, error } = await db
    .from("orders")
    .insert({
      channel: "website",
      kind: refill ? "refill" : "activation",
      customer_name: input.name,
      customer_email: input.email.toLowerCase(),
      customer_phone: input.phone,
      zip_code: refill ? null : input.zip,
      area_code: refill ? null : input.area_code || null,
      carrier_id: carrier.id,
      plan_id: plan.id,
      day_package_id: pkg.id,
      addon_id: useAddon?.id ?? null,
      carrier_name: carrier.name,
      plan_name: plan.name,
      // An activation is always a SIM card; a refill is whatever line the number is.
      product_type: refill ? plan.product_type : "physical",
      days: pkg.days,
      addon_name: useAddon?.name ?? null,
      quantity: 1,
      unit_price_cents: unitCents,
      addon_price_cents: useAddon?.price_cents ?? 0,
      shipping_cents: 0,
      sim_card_price_cents: 0,
      network_fee_cents: networkFeeCents,
      total_cents: total,
      discount_code_id: discount?.id ?? null,
      discount_code: discount?.code ?? null,
      discount_cents: discount?.cents ?? 0,
    })
    .select("*")
    .single()
  if (error || !order) {
    console.error("[refill] order insert failed", error)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const { data: match } = await db.rpc("match_line", { p_phone: linePhone, p_iccid: iccid })
  const { error: itemError } = await db.from("order_items").insert({
    order_id: order.id,
    seq: 1,
    phone_number: linePhone,
    iccid,
    refill_of_item: (match as string | null) ?? null,
  })
  if (itemError) {
    console.error("[refill] item insert failed", itemError)
    await db.from("orders").delete().eq("id", order.id)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const provider = getPaymentProvider()
  if (!provider) {
    const { error: queueError } = await db.rpc("mark_order_paid", { p_order_id: order.id, p_payment_status: "not_required" })
    if (queueError) {
      console.error("[refill] could not queue order", queueError)
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
    console.error("[refill] could not open an invoice", err)
  }
  redirect(invoiceUrl ?? `/order/${order.public_token}?pay=error`)
}
