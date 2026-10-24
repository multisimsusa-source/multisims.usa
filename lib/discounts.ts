import "server-only"

import type { DiscountRule } from "@/lib/pricing"
import { createServiceClient } from "@/lib/supabase/service"

export type DiscountCode = DiscountRule & { id: string; code: string }

/**
 * A code the buyer typed, if it can be used on this carrier now: active, started, not
 * ended, uses left. Case does not matter. Returns the reason in plain words otherwise.
 */
export async function findDiscountCode(input: string, carrierId: string): Promise<{ ok: true; code: DiscountCode } | { ok: false; error: string }> {
  const typed = input.trim()
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(typed)) return { ok: false, error: "That code is not valid" }

  const db = createServiceClient()
  const { data } = await db
    .from("discount_codes")
    .select("id, code, kind, value, carrier_id, starts_at, ends_at, max_uses, uses, active")
    .eq("code", typed)
    .maybeSingle()
  const now = Date.now()
  if (!data || !data.active) return { ok: false, error: "That code is not valid" }
  if (data.starts_at && new Date(data.starts_at).getTime() > now) return { ok: false, error: "That code is not active yet" }
  if (data.ends_at && new Date(data.ends_at).getTime() <= now) return { ok: false, error: "That code has ended" }
  if (data.max_uses !== null && data.uses >= data.max_uses) return { ok: false, error: "That code has been used up" }
  if (data.carrier_id && data.carrier_id !== carrierId) return { ok: false, error: "That code is not for this carrier" }
  return { ok: true, code: { id: data.id, code: String(data.code).toUpperCase(), kind: data.kind as DiscountRule["kind"], value: data.value } }
}
