"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { requireRole } from "@/lib/auth"
import type { FormState } from "@/lib/form-state"
import { notifyNewTicket } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"
import { fileTicket, ticketValues } from "@/lib/tickets"
import { finishTicketUpload, startTicketUpload, type UploadTicket } from "@/lib/ticket-files"
import type { ActionResult } from "@/lib/admin/result"
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

/** The dealer's own request (RLS returns only their tickets), or null. */
async function dealerTicket(ticketId: string) {
  if (!z.uuid().safeParse(ticketId).success) return null
  const supabase = await createClient()
  const { data } = await supabase.from("tickets").select("id, status").eq("id", ticketId).maybeSingle()
  return data
}

/** Step one of adding a photo or video to a request: a signed upload link. */
export async function startDealerTicketFile(ticketId: string, file: { type: string; size: number }): Promise<UploadTicket> {
  await requireRole("dealer")
  const ticket = await dealerTicket(ticketId)
  if (!ticket) return { ok: false, error: "We could not find this ticket." }
  if (ticket.status === "resolved") return { ok: false, error: "This ticket is closed. Open a new one if the problem is back." }
  return startTicketUpload(ticket.id, { type: String(file?.type ?? ""), size: Number(file?.size ?? 0) })
}

/** Step two: the file is in storage; check it and add it to the request. */
export async function finishDealerTicketFile(ticketId: string, path: string): Promise<ActionResult> {
  const me = await requireRole("dealer")
  const ticket = await dealerTicket(ticketId)
  if (!ticket) return { ok: false, error: "We could not find this ticket." }
  const done = await finishTicketUpload(ticket.id, String(path ?? ""), { addedBy: "customer", uploadedBy: me.id })
  if (!done.ok) return done
  refresh()
  return { ok: true }
}
