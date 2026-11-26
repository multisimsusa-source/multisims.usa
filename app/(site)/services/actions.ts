"use server"

import { after } from "next/server"
import { redirect } from "next/navigation"
import { z } from "zod"

import { tidyPhone } from "@/lib/format"
import { notifyAwaitingPayment, notifyOrderPaid } from "@/lib/notify"
import { getPaymentProvider, invoiceUrlForOrder, minimumOrderCents } from "@/lib/payments"
import { minimumOrderMessage } from "@/lib/pricing"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request"
import { findServiceOffer } from "@/lib/services"
import { createServiceClient } from "@/lib/supabase/service"
import type { Order } from "@/lib/types"

const schema = z.object({
  service: z.enum(["esim_qr", "number_change"], "Choose what you need"),
  carrier: z.uuid("Choose your carrier"),
  line_phone: z
    .string()
    .trim()
    .refine((v) => {
      const digits = v.replace(/\D/g, "")
      return /^[0-9 ()+.-]+$/.test(v) && (digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))
    }, "Enter the US number, for example (212) 555-0100"),
  iccid: z.union([
    z.literal(""),
    z
      .string()
      .transform((v) => v.replace(/\s/g, ""))
      .refine((v) => /^[0-9]{18,22}[Ff]?$/.test(v), "An ICCID is 18 to 22 digits, printed on the SIM card"),
  ]),
  zip: z.string().trim().regex(/^([0-9]{5})?$/, "Enter a 5-digit US ZIP code, or leave it empty"),
  area_code: z.string().trim().regex(/^([2-9][0-9]{2})?$/, "Enter 3 digits, for example 212, or leave it empty"),
  name: z.string().trim().min(2, "Enter your full name").max(120, "Keep your name under 120 characters"),
  email: z.email("Enter a valid email address").max(200, "Keep the email under 200 characters"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, "Enter a phone number with country code, for example +94 77 123 4567")
    .refine((v) => {
      const digits = v.replace(/\D/g, "").length
      return digits >= 7 && digits <= 15
    }, "Enter a phone number with country code, for example +94 77 123 4567"),
})

export type ServiceField = "service" | "carrier" | "line_phone" | "iccid" | "zip" | "area_code" | "name" | "email" | "phone"

export type ServiceState = {
  status: "idle" | "error"
  message?: string
  fieldErrors?: Partial<Record<ServiceField, string>>
  values?: Record<string, string>
}

/**
 * A service on a line the customer already has: an eSIM QR code or a new number. One number
 * per order; the fee is read here from the owner's price list, never taken from the form.
 * Pays like a refill; the agent queue gets it once paid.
 */
export async function placeServiceOrder(_prev: ServiceState, formData: FormData): Promise<ServiceState> {
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])
  )
  if (values.company) return { status: "error", message: "Something went wrong. Please try again.", values }

  const parsed = schema.safeParse({ ...values, iccid: values.iccid ?? "", zip: values.zip ?? "", area_code: values.area_code ?? "" })
  const fieldErrors: ServiceState["fieldErrors"] = {}
  if (!parsed.success) for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as ServiceField] ??= issue.message

  const offer = parsed.success ? await findServiceOffer(parsed.data.carrier, parsed.data.service) : null
  if (parsed.success && !offer) fieldErrors.carrier = "This service is not offered for this carrier any more. Choose another."
  if (!parsed.success || !offer || Object.keys(fieldErrors).length) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors, values }
  }
  const input = parsed.data

  const db = createServiceClient()
  const { data: settings } = await db.from("settings").select("network_fee_cents, min_order_cents").maybeSingle()
  const networkFeeCents = settings?.network_fee_cents ?? 0
  const total = offer.price_cents + networkFeeCents
  const minimum = await minimumOrderCents(settings?.min_order_cents ?? 0)
  if (total < minimum) return { status: "error", message: minimumOrderMessage(minimum, "Contact us and we will help you."), values }

  if (!(await rateLimit(`service:${await clientIp()}`, 8, 10 * 60_000)).ok) {
    return { status: "error", message: "Too many orders from this connection. Please wait a few minutes.", values }
  }

  const linePhone = tidyPhone(input.line_phone)
  const iccid = input.iccid || null
  const { data: order, error } = await db
    .from("orders")
    .insert({
      channel: "website",
      kind: "service",
      service_code: offer.service_code,
      customer_name: input.name,
      customer_email: input.email.toLowerCase(),
      customer_phone: input.phone,
      // Where the new number should be: only for a number change.
      zip_code: offer.service_code === "number_change" ? input.zip || null : null,
      area_code: offer.service_code === "number_change" ? input.area_code || null : null,
      carrier_id: offer.carrier_id,
      carrier_name: offer.carrier_name,
      plan_name: offer.service_name,
      product_type: offer.service_code === "esim_qr" ? "esim" : "physical",
      days: null,
      quantity: 1,
      unit_price_cents: offer.price_cents,
      addon_price_cents: 0,
      shipping_cents: 0,
      sim_card_price_cents: 0,
      network_fee_cents: networkFeeCents,
      total_cents: total,
    })
    .select("*")
    .single()
  if (error || !order) {
    console.error("[service] order insert failed", error)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const { data: match } = await db.rpc("match_line", { p_phone: linePhone, p_iccid: iccid, p_carrier_id: offer.carrier_id })
  const { error: itemError } = await db.from("order_items").insert({
    order_id: order.id,
    seq: 1,
    phone_number: linePhone,
    iccid,
    old_phone_number: linePhone,
    old_iccid: iccid,
    refill_of_item: (match as string | null) ?? null,
  })
  if (itemError) {
    console.error("[service] item insert failed", itemError)
    await db.from("orders").delete().eq("id", order.id)
    return { status: "error", message: "We could not place your order. Please try again.", values }
  }

  const provider = getPaymentProvider()
  if (!provider) {
    const { error: queueError } = await db.rpc("mark_order_paid", { p_order_id: order.id, p_payment_status: "not_required" })
    if (queueError) {
      console.error("[service] could not queue order", queueError)
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
    console.error("[service] could not open an invoice", err)
  }
  redirect(invoiceUrl ?? `/order/${order.public_token}?pay=error`)
}
