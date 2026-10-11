"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { notifyNewOrderToStaff } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"
import type { Order } from "@/lib/types"

const uuid = z.uuid()

function fail(error: { message?: string } | null): ActionResult {
  const msg = error?.message ?? ""
  return { ok: false, error: msg && !/violates|syntax/.test(msg) ? msg.charAt(0).toUpperCase() + msg.slice(1) + "." : "That did not work. Refresh and try again." }
}

/** Hand an open order to an agent, or to yourself. The note shows on their screen. */
export async function reassignOrder(orderId: string, agentId: string, note: string): Promise<ActionResult> {
  await requireRole("admin")
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(agentId).success) return { ok: false, error: "Choose who takes it" }
  const supabase = await createClient()
  const { error } = await supabase.rpc("reassign_order", { p_order_id: orderId, p_agent_id: agentId, p_note: note.trim().slice(0, 500) })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: "Reassigned" }
}

export async function cancelOrder(orderId: string, reason: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason.trim().slice(0, 500) })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: "Order cancelled" }
}

/** Records a refund the owner sent from his own wallet. No money moves here. */
export async function recordRefund(orderId: string, note: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { error } = await supabase.rpc("record_refund", { p_order_id: orderId, p_note: note.trim().slice(0, 500) })
  if (error) return fail(error)
  refresh()
  return { ok: true, message: "Refund recorded" }
}

export async function approveReplacement(orderId: string): Promise<ActionResult> {
  await requireRole("admin")
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("approve_replacement", { p_order_id: orderId })
  if (error) return fail(error)
  const order = data as Order
  after(() => notifyNewOrderToStaff(order))
  refresh()
  return { ok: true, message: "Approved. It is in the queue." }
}
