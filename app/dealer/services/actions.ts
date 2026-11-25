"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { formatPrice, tidyPhone } from "@/lib/format"
import { notifyNewBatchToStaff } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  carrier_id: z.uuid("Choose a carrier"),
  service: z.enum(["esim_qr", "number_change"], "Choose a service"),
  numbers: z
    .array(
      z.object({
        phone: z.string().trim().min(10, "A phone number is too short").max(30),
        iccid: z.string().trim().max(30),
      })
    )
    .min(1, "Paste at least one number")
    .max(500, "At most 500 numbers per request"),
  reference: z.string().trim().max(80, "Keep it under 80 characters"),
})

export type DealerServiceInput = z.input<typeof schema>

/**
 * A QR code or a number change for many numbers of one carrier. The price and funds are
 * checked again in place_dealer_service, which holds the total on the wallet; each number is
 * charged only once it is done.
 */
export async function placeDealerService(input: DealerServiceInput): Promise<ActionResult> {
  await requireRole("dealer")
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, fieldErrors: { [issue.path[0] === "reference" ? "reference" : "numbers"]: issue.message } }
  }
  const seen = new Set<string>()
  for (const n of parsed.data.numbers) {
    const key = n.phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")
    if (seen.has(key)) return { ok: false, error: `${n.phone} is in this request more than once. Keep it on one row only.` }
    seen.add(key)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("place_dealer_service", {
    p_carrier_id: parsed.data.carrier_id,
    p_service_code: parsed.data.service,
    p_numbers: parsed.data.numbers.map((n) => ({ phone: tidyPhone(n.phone), iccid: n.iccid.replace(/\s/g, "") })),
    p_reference: parsed.data.reference || null,
  })
  if (error || !data) {
    const funds = /this order is (\d+) and (-?\d+) is available/.exec(error?.message ?? "")
    if (funds) {
      return {
        ok: false,
        error: `This request is ${formatPrice(Number(funds[1]))} and you have ${formatPrice(Number(funds[2]))} available. Top up or ask us to add funds.`,
      }
    }
    if (error?.code === "P0001") {
      const msg = error.message
      return { ok: false, error: msg.charAt(0).toUpperCase() + msg.slice(1) + (msg.endsWith(".") ? "" : ".") }
    }
    return { ok: false, error: "Could not place the request. Nothing was charged. Try again." }
  }
  const batch = data as { id: string; number: number }
  after(() => notifyNewBatchToStaff(batch.id))
  refresh()
  return { ok: true, id: batch.id, message: `Request B-${batch.number} placed` }
}
