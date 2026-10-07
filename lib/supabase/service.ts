import "server-only"

import { createClient } from "@supabase/supabase-js"

import { supabaseUrl } from "./env"

/**
 * Service-role client. Bypasses RLS, so it is only used for read paths that filter to
 * public data (the published catalogue) and for trusted scripts. Never for user writes.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
