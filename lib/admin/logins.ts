import "server-only"

import { z } from "zod"

import { zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { createServiceClient } from "@/lib/supabase/service"
import type { UserRole } from "@/lib/types"

/**
 * Agent and dealer logins. Creating, banning and resetting need the Supabase Auth admin
 * API, so these run with the service role; every caller checks for the owner first.
 * Nobody signs themselves up.
 */

export const loginPassword = z.string().min(10, "Use at least 10 characters").max(72, "Too long")

const loginSchema = z.object({
  full_name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.email("Enter a valid email").max(200),
  password: loginPassword,
})

export type NewLogin = z.infer<typeof loginSchema>

export function parseLogin(formData: FormData) {
  const parsed = loginSchema.safeParse({
    full_name: formData.get("full_name"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { ok: false as const, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) }
  }
  return { ok: true as const, data: parsed.data }
}

/** Creates the Auth user and its profile. Returns the new user id. */
export async function createLogin(role: Exclude<UserRole, "admin">, login: NewLogin): Promise<ActionResult & { userId?: string }> {
  const db = createServiceClient()
  const { data: existing } = await db.from("profiles").select("id, role").eq("email", login.email).maybeSingle()
  if (existing) {
    return { ok: false, error: `That email already has a ${existing.role} login`, fieldErrors: { email: "Already has a login" } }
  }

  const { data, error } = await db.auth.admin.createUser({
    email: login.email,
    password: login.password,
    email_confirm: true,
    user_metadata: { full_name: login.full_name },
  })
  if (error || !data.user) {
    return { ok: false, error: /already/i.test(error?.message ?? "") ? "That email already has an account" : "Could not create the login. Try again." }
  }

  const { error: profileError } = await db
    .from("profiles")
    .insert({ id: data.user.id, role, email: login.email, full_name: login.full_name, active: true })
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: "Could not create the login. Try again." }
  }
  return { ok: true, userId: data.user.id }
}

/** Removes a login created moments ago when a later step failed. */
export async function deleteLogin(userId: string) {
  const db = createServiceClient()
  await db.auth.admin.deleteUser(userId)
}

/** Switches a login on or off, at the profile and at Auth, so an open session stops working. */
export async function setLoginActive(role: Exclude<UserRole, "admin">, userId: string, active: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Unknown login" }
  const db = createServiceClient()
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle()
  if (profile?.role !== role) return { ok: false, error: `Only ${role} logins can be changed here` }

  const { error } = await db.from("profiles").update({ active }).eq("id", userId)
  if (error) return { ok: false, error: "Could not update. Try again." }
  await db.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" })
  return { ok: true }
}

export async function resetLoginPassword(role: Exclude<UserRole, "admin">, userId: string, newPassword: string): Promise<ActionResult> {
  const parsed = loginPassword.safeParse(newPassword)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const db = createServiceClient()
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle()
  if (profile?.role !== role) return { ok: false, error: `Only ${role} logins can be changed here` }
  const { error } = await db.auth.admin.updateUserById(userId, { password: parsed.data })
  if (error) return { ok: false, error: "Could not change the password. Try again." }
  return { ok: true, message: "Password changed. Share it with them yourself." }
}
