"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { requireRole } from "@/lib/auth"
import type { FormState } from "@/lib/form-state"
import { notifyNewTicket } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"
import { fileTicket, ticketValues } from "@/lib/tickets"
import type { Order } from "@/lib/types"

/** A dealer reports a problem with one line of a bulk order. */
export async function createDealerTicket(
  orderId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireRole("dealer")
  const values = ticketValues(formData)
  if (!z.uuid().safeParse(orderId).success)
    return { status: "error", message: "We could not find this order.", values }

  // RLS returns the order only when it is this dealer's.
  const supabase = await createClient()
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle()
  if (!order)
    return { status: "error", message: "We could not find this order.", values }

  const { state, ticket } = await fileTicket(order.id, formData)
  if (!ticket) return state
  after(() => notifyNewTicket(order as Order, ticket))
  refresh()
  return state
}
