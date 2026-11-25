"use server"

import { z } from "zod"

import { catalogChanged } from "@/lib/admin/catalog-changed"
import { dbFailed, parseMoney, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

const code = z.enum(["esim_qr", "number_change"])

/**
 * One carrier's price for one service: the customer price, the dealer price (empty: not
 * offered to dealers) and whether it is offered at all.
 */
export async function saveCarrierService(carrierId: string, service: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(carrierId).success || !code.safeParse(service).success) return { ok: false, error: "Unknown service" }
  const price = parseMoney(formData.get("price"))
  const wholesale = parseMoney(formData.get("wholesale_price"))
  const active = formData.get("active") === "on"
  const fieldErrors: Record<string, string> = {}
  if (price === null || Number.isNaN(price)) fieldErrors.price = "Enter a price, for example 5.00"
  else if (price <= 0) fieldErrors.price = "A price must be above $0.00"
  if (wholesale !== null && Number.isNaN(wholesale)) fieldErrors.wholesale_price = "Enter a price or leave empty"
  else if (wholesale !== null && wholesale <= 0) fieldErrors.wholesale_price = "Above $0.00, or leave empty"
  if (Object.keys(fieldErrors).length) return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase.from("carrier_services").upsert(
    { carrier_id: carrierId, service_code: service, price_cents: price!, wholesale_price_cents: wholesale, active },
    { onConflict: "carrier_id,service_code" }
  )
  if (error) return dbFailed(error)
  catalogChanged()
  return { ok: true, message: active ? "Saved and offered" : "Saved, not offered" }
}
