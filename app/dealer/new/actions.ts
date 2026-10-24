"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { formatPrice } from "@/lib/format"
import { notifyNewBatchToStaff } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  lines: z
    .array(
      z.object({
        day_package_id: z.uuid("Choose a plan and length"),
        quantity: z
          .number()
          .int()
          .min(1, "At least 1 SIM")
          .max(500, "At most 500 SIMs per line"),
        intl_calling: z.boolean(),
      })
    )
    .min(1, "Add at least one line")
    .max(30, "At most 30 lines per order"),
  address: z
    .object({
      line1: z.string().trim().min(3, "Enter the street address").max(120),
      line2: z.string().trim().max(120),
      city: z.string().trim().min(2, "Enter the city").max(80),
      state: z.string().regex(/^[A-Z]{2}$/, "Choose a state"),
      zip: z
        .string()
        .trim()
        .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit US ZIP code"),
    })
    .nullable(),
  reference: z.string().trim().max(80, "Keep it under 80 characters"),
})

export type DealerOrderInput = z.input<typeof schema>

/**
 * Places a bulk order. Prices, availability and funds are all checked again in
 * place_dealer_batch, which locks the dealer's wallet while it works.
 */
export async function placeDealerOrder(
  input: DealerOrderInput
): Promise<ActionResult> {
  await requireRole("dealer")
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field =
      issue.path[0] === "address"
        ? String(issue.path[1] ?? "address")
        : issue.path[0] === "reference"
          ? "reference"
          : "lines"
    return {
      ok: false,
      error: issue.message,
      fieldErrors: { [field]: issue.message },
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("place_dealer_batch", {
    p_lines: parsed.data.lines,
    p_address: parsed.data.address,
    p_reference: parsed.data.reference || null,
  })
  if (error || !data) {
    const funds = /this order is (\d+) and (-?\d+) is available/.exec(
      error?.message ?? ""
    )
    if (funds) {
      return {
        ok: false,
        error: `This order is ${formatPrice(Number(funds[1]))} and you have ${formatPrice(Number(funds[2]))} available. Top up or ask us to add funds.`,
      }
    }
    if (error?.code === "P0001")
      return { ok: false, error: capitalise(error.message) }
    return {
      ok: false,
      error: "Could not place the order. Nothing was charged. Try again.",
    }
  }

  const batch = data as { id: string; number: number }
  after(() => notifyNewBatchToStaff(batch.id))
  // The balance in the portal bar lives in the layout; redraw it.
  refresh()
  return { ok: true, id: batch.id, message: `Order B-${batch.number} placed` }
}

function capitalise(message: string) {
  return (
    message.charAt(0).toUpperCase() +
    message.slice(1) +
    (message.endsWith(".") ? "" : ".")
  )
}
