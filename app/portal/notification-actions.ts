"use server"

import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

/** Marks the signed-in person's notifications read: one, or all of them. RLS keeps it to their own. */
export async function markNotificationsRead(id?: number): Promise<ActionResult> {
  const profile = await getSessionProfile()
  if (!profile) return { ok: false, error: "Sign in again" }
  if (id !== undefined && !z.number().int().positive().safeParse(id).success) return { ok: false, error: "Unknown notification" }
  const supabase = await createClient()
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null)
  if (id !== undefined) query = query.eq("id", id)
  const { error } = await query
  if (error) return { ok: false, error: "Could not update. Try again." }
  return { ok: true }
}
