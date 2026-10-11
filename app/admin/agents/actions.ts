"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
import { agentWelcomeEmail } from "@/lib/emails"
import { absoluteUrl } from "@/lib/site"
import { createServiceClient } from "@/lib/supabase/service"

const password = z.string().min(10, "Use at least 10 characters").max(72, "Too long")

const createSchema = z.object({
  full_name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.email("Enter a valid email").max(200),
  password,
})

/**
 * Creating logins needs the Supabase Auth admin API, so these run with the service role
 * after an explicit owner check. Agents never sign themselves up.
 */
export async function createAgent(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = createSchema.safeParse({
    full_name: formData.get("full_name"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: formData.get("password"),
  })
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) }
  const { full_name, email } = parsed.data

  const db = createServiceClient()
  const { data: existing } = await db.from("profiles").select("id, role").eq("email", email).maybeSingle()
  if (existing) {
    return { ok: false, error: `That email already has a ${existing.role} login`, fieldErrors: { email: "Already has a login" } }
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name },
  })
  if (error || !data.user) {
    return { ok: false, error: /already/i.test(error?.message ?? "") ? "That email already has an account" : "Could not create the login. Try again." }
  }

  const { error: profileError } = await db.from("profiles").insert({ id: data.user.id, role: "agent", email, full_name, active: true })
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: "Could not create the login. Try again." }
  }

  const mail = agentWelcomeEmail(full_name, absoluteUrl("/portal/login"))
  after(() => sendEmail({ sender: "orders", to: email, ...mail }))
  refresh()
  return { ok: true, message: `${full_name} can sign in now. Share the password with them yourself.` }
}

export async function setAgentActive(agentId: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(agentId).success) return { ok: false, error: "Unknown agent" }
  const db = createServiceClient()
  const { data: agent } = await db.from("profiles").select("role").eq("id", agentId).maybeSingle()
  if (agent?.role !== "agent") return { ok: false, error: "Only agent logins can be changed here" }

  const { error } = await db.from("profiles").update({ active }).eq("id", agentId)
  if (error) return { ok: false, error: "Could not update. Try again." }
  // Ban or unban at the Auth level too, so an existing session stops working.
  await db.auth.admin.updateUserById(agentId, { ban_duration: active ? "none" : "876000h" })

  if (!active) {
    // Anything they were holding goes back to the queue.
    await db.from("orders").update({ status: "queued", claimed_by: null, claimed_at: null }).eq("claimed_by", agentId).eq("status", "claimed")
  }
  refresh()
  return { ok: true, message: active ? "Login switched on" : "Login switched off. Their claimed orders went back to the queue." }
}

export async function resetAgentPassword(agentId: string, newPassword: string): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = password.safeParse(newPassword)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const db = createServiceClient()
  const { data: agent } = await db.from("profiles").select("role").eq("id", agentId).maybeSingle()
  if (agent?.role !== "agent") return { ok: false, error: "Only agent logins can be changed here" }
  const { error } = await db.auth.admin.updateUserById(agentId, { password: parsed.data })
  if (error) return { ok: false, error: "Could not change the password. Try again." }
  return { ok: true, message: "Password changed. Share it with them yourself." }
}
