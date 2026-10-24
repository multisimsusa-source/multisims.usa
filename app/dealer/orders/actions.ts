"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { notifyNewOrderToStaff } from "@/lib/notify"
import { createClient } from "@/lib/supabase/server"
import type { Order } from "@/lib/types"

/** The dealer has the SIM cards in hand: every posted line in the batch goes to be activated. */
export async function requestBatchActivation(batchId: string): Promise<ActionResult> {
  await requireRole("dealer")
  if (!z.uuid().safeParse(batchId).success) return { ok: false, error: "Unknown order" }
  const supabase = await createClient()
  const { data: count, error } = await supabase.rpc("request_batch_activation", { p_batch_id: batchId })
  if (error) return { ok: false, error: "Could not start the lines. Try again." }
  if (!count) return { ok: false, error: "These SIM cards are already being activated." }

  const { data: orders } = await supabase.from("orders").select("*").eq("batch_id", batchId).eq("status", "queued").eq("phase", "activate")
  await Promise.all(((orders ?? []) as Order[]).map((o) => notifyNewOrderToStaff(o, { activation: true })))
  refresh()
  return { ok: true, message: "Your lines are starting up" }
}
