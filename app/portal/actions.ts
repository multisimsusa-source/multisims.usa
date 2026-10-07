"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { roleHome } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/lib/types"

export type LoginState = { error?: string; email?: string }

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim()
  const parsed = schema.safeParse({ email, password: formData.get("password") })
  if (!parsed.success) return { error: "Enter your email and password.", email }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  if (!(await rateLimit(`login:${ip}`, 10, 10 * 60_000)).ok) {
    return { error: "Too many attempts. Please wait a few minutes and try again.", email }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error || !data.user) return { error: "That email and password do not match.", email }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", data.user.id)
    .maybeSingle()

  if (!profile || !profile.active) {
    await supabase.auth.signOut()
    return { error: "This account is not active. Contact the MultiSims USA team.", email }
  }

  const home = roleHome[profile.role as UserRole]
  const next = String(formData.get("next") ?? "")
  redirect(next.startsWith(home) ? next : home)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/portal/login")
}
