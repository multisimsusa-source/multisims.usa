"use server"

import { loginPassword } from "@/lib/admin/logins"
import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

/** The signed-in dealer sets a new password for themselves. */
export async function changeOwnPassword(
  password: string,
  confirm: string
): Promise<ActionResult> {
  await requireRole("dealer")
  const parsed = loginPassword.safeParse(password)
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      fieldErrors: { password: parsed.error.issues[0].message },
    }
  if (password !== confirm)
    return {
      ok: false,
      error: "The two passwords are different",
      fieldErrors: { confirm: "Type the same password again" },
    }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) {
    return /different from the old|same/i.test(error.message)
      ? {
          ok: false,
          error: "Choose a password you have not used here before",
          fieldErrors: { password: "Use a new password" },
        }
      : { ok: false, error: "Could not change the password. Try again." }
  }
  return { ok: true, message: "Password changed" }
}
