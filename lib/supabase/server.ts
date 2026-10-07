import "server-only"

import { cookies } from "next/headers"
import { connection } from "next/server"
import { createServerClient } from "@supabase/ssr"

import { supabaseAnonKey, supabaseUrl } from "./env"

/** Supabase client bound to the signed-in user's session. RLS applies. */
export async function createClient() {
  // Session reads are per request. Supabase auth also reads the clock (token expiry) and
  // generates ids, which Cache Components rejects during prerender unless the render is
  // explicitly request-time.
  await connection()
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  })
}
