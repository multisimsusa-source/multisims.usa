"use server"

import { after } from "next/server"
import { refresh } from "next/cache"

import { createLogin, parseLogin, resetLoginPassword, setLoginActive } from "@/lib/admin/logins"
import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
import { agentWelcomeEmail } from "@/lib/emails"
import { absoluteUrl } from "@/lib/site"
import { createServiceClient } from "@/lib/supabase/service"

export async function createAgent(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const parsed = parseLogin(formData)
  if (!parsed.ok) return parsed
  const { full_name, email } = parsed.data

  const created = await createLogin("agent", parsed.data)
  if (!created.ok) return created

  const mail = agentWelcomeEmail(full_name, absoluteUrl("/portal/login"))
  after(() => sendEmail({ sender: "orders", to: email, ...mail }))
  refresh()
  return { ok: true, message: `${full_name} can sign in now. Share the password with them yourself.` }
}

export async function setAgentActive(agentId: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const result = await setLoginActive("agent", agentId, active)
  if (!result.ok) return result

  if (!active) {
    // Anything they were holding goes back to the queue.
    const db = createServiceClient()
    await db.from("orders").update({ status: "queued", claimed_by: null, claimed_at: null }).eq("claimed_by", agentId).eq("status", "claimed")
  }
  refresh()
  return { ok: true, message: active ? "Login switched on" : "Login switched off. Their claimed orders went back to the queue." }
}

export async function resetAgentPassword(agentId: string, newPassword: string): Promise<ActionResult> {
  await requireRole("admin")
  return resetLoginPassword("agent", agentId, newPassword)
}
