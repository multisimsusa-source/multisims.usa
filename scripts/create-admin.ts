/**
 * Creates (or promotes) the admin login.
 *   bun run admin:create owner@example.com 'a-long-password' "Zafir"
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { createClient } from "@supabase/supabase-js"

const [email, password, fullName = "Admin"] = process.argv.slice(2)
if (!email || !password) {
  console.error("Usage: bun run admin:create <email> <password> [full name]")
  process.exit(1)
}
if (password.length < 10) {
  console.error("Use a password of at least 10 characters.")
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: created, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
})

let userId = created.user?.id
if (error) {
  if (!/already/i.test(error.message)) throw error
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!existing) throw error
  userId = existing.id
  await supabase.auth.admin.updateUserById(userId, { password })
}

const { error: profileError } = await supabase
  .from("profiles")
  .upsert({ id: userId, role: "admin", email, full_name: fullName, active: true })
if (profileError) throw profileError

console.log(`Admin ready: ${email}`)
