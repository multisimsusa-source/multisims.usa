import "server-only"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import type { Profile, UserRole } from "@/lib/types"

export const roleHome: Record<UserRole, string> = {
  admin: "/admin",
  agent: "/agent",
  dealer: "/dealer",
}

/** The signed-in user's active profile, verified against Supabase Auth. */
export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  if (!userId) return null

  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, active")
    .eq("id", userId)
    .maybeSingle()
  if (!data || !data.active) return null
  return data as Profile
}

/** Gate a portal page or action to one role. Redirects instead of rendering. */
export async function requireRole(role: UserRole): Promise<Profile> {
  const profile = await getSessionProfile()
  if (!profile) redirect("/portal/login")
  if (profile.role !== role) redirect(roleHome[profile.role])
  return profile
}
