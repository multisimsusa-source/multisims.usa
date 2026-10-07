import "server-only"

import { createServiceClient } from "@/lib/supabase/service"

/**
 * Fixed-window limiter backed by Postgres (`rate_limit_hit`), so the count holds across
 * serverless instances. If the database call fails (for example the migration has not
 * been applied yet), it falls back to a per-instance in-memory counter rather than
 * letting every request through or locking everyone out.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: Math.ceil(windowMs / 1000),
  })
  if (!error && typeof data === "boolean") return { ok: data }

  console.error("rate_limit_hit failed, using in-memory fallback:", error?.message)
  return memoryRateLimit(key, limit, windowMs)
}

const buckets = new Map<string, { count: number; resetAt: number }>()

function memoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (bucket.count >= limit) return { ok: false }
  bucket.count += 1
  return { ok: true }
}
