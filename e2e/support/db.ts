import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { assertLocal, DOMAIN, localSupabase, OWNER, AGENT, PASSWORD } from "./env"

/** Service-role client for the local stack: test setup, checks and cleanup only. */
export function db(): SupabaseClient {
  const env = localSupabase()
  assertLocal(env.url)
  return createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** The owner and agent test logins. Dealers are created through the admin UI by the tests. */
export async function seedTestUsers() {
  const client = db()
  for (const [email, role, name] of [
    [OWNER, "admin", "E2E Owner"],
    [AGENT, "agent", "E2E Agent"],
  ] as const) {
    const { data, error } = await client.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`)
    const { error: profileError } = await client.from("profiles").insert({ id: data.user.id, role, email, full_name: name, active: true })
    if (profileError) throw new Error(`Could not create the ${role} profile: ${profileError.message}`)
  }
}

/** Login and form counters, so a test run never trips the rate limits. Local stack only. */
export async function resetRateLimits() {
  await db().from("rate_limits").delete().neq("key", "")
}

/**
 * Removes every trace of a test run: test logins (@multisims.test), their dealers and
 * wallets, test orders and their files, E2E carriers, plans and discount codes.
 */
export async function cleanupTestData() {
  const client = db()
  const { data: profiles } = await client.from("profiles").select("id").like("email", `%@${DOMAIN}`)
  const userIds = (profiles ?? []).map((p) => p.id as string)
  const { data: dealers } = userIds.length ? await client.from("dealers").select("profile_id").in("profile_id", userIds) : { data: [] }
  const dealerIds = (dealers ?? []).map((d) => d.profile_id as string)
  const { data: carriers } = await client.from("carriers").select("id").like("name", "E2E%")
  const carrierIds = (carriers ?? []).map((c) => c.id as string)

  // Orders made by the tests: test customers, test dealers, or on test carriers.
  const filters = [`customer_email.like.%@${DOMAIN}`]
  if (dealerIds.length) filters.push(`dealer_id.in.(${dealerIds.join(",")})`)
  if (carrierIds.length) filters.push(`carrier_id.in.(${carrierIds.join(",")})`)
  const { data: orders } = await client.from("orders").select("id").or(filters.join(","))
  const roots = (orders ?? []).map((o) => o.id as string)
  const { data: replacements } = roots.length ? await client.from("orders").select("id").in("replacement_of", roots) : { data: [] }
  const orderIds = [...new Set([...roots, ...(replacements ?? []).map((r) => r.id as string)])]

  if (dealerIds.length) {
    await must(client.from("wallet_ledger").delete().in("dealer_id", dealerIds))
    await must(client.from("payments").delete().in("dealer_id", dealerIds))
  }
  if (orderIds.length) {
    await must(client.from("wallet_ledger").delete().in("order_id", orderIds))
    await removeFiles(client, "esim-qr", orderIds)
    await removeFiles(client, "ticket-screenshots", orderIds)
    // Replacements first: they point at the originals.
    await must(client.from("orders").delete().in("id", orderIds).not("replacement_of", "is", null))
    await must(client.from("orders").delete().in("id", orderIds))
  }
  if (dealerIds.length) {
    await must(client.from("order_batches").delete().in("dealer_id", dealerIds))
    await must(client.from("dealers").delete().in("profile_id", dealerIds))
  }
  await must(client.from("discount_codes").delete().like("code", "E2E%"))
  if (carrierIds.length) await must(client.from("carriers").delete().in("id", carrierIds))
  for (const id of userIds) {
    const { error } = await client.auth.admin.deleteUser(id)
    if (error) throw new Error(`Could not delete test user ${id}: ${error.message}`)
  }
  await resetRateLimits()
  return { users: userIds.length, dealers: dealerIds.length, orders: orderIds.length, carriers: carrierIds.length }
}

async function must(query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query
  if (error) throw new Error(`Cleanup failed: ${error.message}`)
}

async function removeFiles(client: SupabaseClient, bucket: string, orderIds: string[]) {
  for (const id of orderIds) {
    const { data } = await client.storage.from(bucket).list(id, { limit: 1000 })
    if (data?.length) await client.storage.from(bucket).remove(data.map((f) => `${id}/${f.name}`))
  }
}
