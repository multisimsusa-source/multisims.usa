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
  lines: z
    .array(
      z.object({
        day_package_id: z.uuid("Choose a plan and length"),
        intl_calling: z.boolean(),
        numbers: z
          .array(
            z.object({
              phone: z.string().trim().min(10, "A phone number is too short").max(30),
              iccid: z.string().trim().max(30),
            })
          )
          .min(1, "Paste at least one number")
          .max(500, "At most 500 numbers per line"),
      })
    )
    .min(1, "Add at least one line")
    .max(30, "At most 30 lines per refill"),
  reference: z.string().trim().max(80, "Keep it under 80 characters"),
})

export type DealerRefillInput = z.input<typeof schema>

/**
 * Places a refill for many numbers at once. Prices, plans and funds are checked again in
 * place_dealer_refill, which holds the total on the wallet like a bulk order.
 */
export async function placeDealerRefill(input: DealerRefillInput): Promise<ActionResult> {
  await requireRole("dealer")
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, fieldErrors: { [issue.path[0] === "reference" ? "reference" : "lines"]: issue.message } }
  }
  // One number once per refill, however it was typed: a repeat would be charged twice.
  const seen = new Set<string>()
  for (const line of parsed.data.lines) {
    for (const n of line.numbers) {
      const key = n.phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")
      if (seen.has(key)) return { ok: false, error: `${n.phone} is in this refill more than once. Keep it on one row only.` }
      seen.add(key)
    }
  }
  if (seen.size > 1000) return { ok: false, error: "At most 1,000 numbers per refill. Place the rest as a second refill." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("place_dealer_refill", {
    p_lines: parsed.data.lines.map((l) => ({ ...l, numbers: l.numbers.map((n) => ({ ...n, phone: tidyPhone(n.phone) })) })),
    p_reference: parsed.data.reference || null,
  })
  if (error || !data) {
    const funds = /this order is (\d+) and (-?\d+) is available/.exec(error?.message ?? "")
    if (funds) {
      return {
        ok: false,
        error: `This refill is ${formatPrice(Number(funds[1]))} and you have ${formatPrice(Number(funds[2]))} available. Top up or ask us to add funds.`,
      }
    }
    if (error?.code === "P0001") {
      const msg = error.message
      return { ok: false, error: msg.charAt(0).toUpperCase() + msg.slice(1) + (msg.endsWith(".") ? "" : ".") }
    }
    return { ok: false, error: "Could not place the refill. Nothing was charged. Try again." }
  }
  const batch = data as { id: string; number: number }
  after(() => notifyNewBatchToStaff(batch.id))
  refresh()
  return { ok: true, id: batch.id, message: `Refill B-${batch.number} placed` }
}
