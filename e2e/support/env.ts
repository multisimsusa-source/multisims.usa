import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

/**
 * Where the end-to-end tests run.
 *
 * - local (default): the local Supabase stack (`supabase start`) and a production build of
 *   the app started by Playwright. Email and payments are off.
 * - remote: a deployed site and its Supabase project, for a check before launch. Needs
 *   E2E_TARGET=remote, E2E_ALLOW_REMOTE=1, E2E_BASE_URL and E2E_INBOX (a real inbox: every
 *   test email goes to its plus-addresses, so nothing bounces). Keys come from .env.local.
 *   Payments go through the provider's sandbox.
 */
export const REMOTE = process.env.E2E_TARGET === "remote"

if (REMOTE && process.env.E2E_ALLOW_REMOTE !== "1") {
  throw new Error("Remote end-to-end tests write to a real project. Set E2E_ALLOW_REMOTE=1 to confirm.")
}

/** KEY=value lines from .env.local, for the remote keys (values may contain spaces). */
function envFile(): Record<string, string> {
  if (!existsSync(".env.local")) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1")
  }
  return out
}

export function supabaseTarget() {
  if (REMOTE) {
    const file = envFile()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? file.NEXT_PUBLIC_SUPABASE_URL
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? file.SUPABASE_SERVICE_ROLE_KEY
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? file.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !secret || !publishable) throw new Error("Remote tests need the project's Supabase URL and keys in .env.local.")
    return { url, secret, publishable }
  }
  if (process.env.E2E_SUPABASE_URL && process.env.E2E_SECRET_KEY && process.env.E2E_PUBLISHABLE_KEY) {
    return { url: process.env.E2E_SUPABASE_URL, secret: process.env.E2E_SECRET_KEY, publishable: process.env.E2E_PUBLISHABLE_KEY }
  }
  const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  const get = (key: string) => out.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"))?.[1] ?? ""
  const env = { url: get("API_URL"), secret: get("SECRET_KEY"), publishable: get("PUBLISHABLE_KEY") }
  if (!env.url || !env.secret) throw new Error("Local Supabase is not running. Start it with `supabase start`.")
  assertLocal(env.url)
  process.env.E2E_SUPABASE_URL = env.url
  process.env.E2E_SECRET_KEY = env.secret
  process.env.E2E_PUBLISHABLE_KEY = env.publishable
  return env
}

/** Kept for the local scripts: the same as supabaseTarget(). */
export const localSupabase = supabaseTarget

export function assertLocal(url: string) {
  if (REMOTE) return
  const host = new URL(url).hostname
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run end-to-end tests against ${host} without E2E_TARGET=remote.`)
  }
}

/** The provider's sandbox API, for simulating a buyer paying an invoice (remote only). */
export function paymentsSandbox() {
  const file = envFile()
  const key = process.env.NOWPAYMENTS_API_KEY ?? file.NOWPAYMENTS_API_KEY
  if (!key) throw new Error("Remote tests need NOWPAYMENTS_API_KEY (sandbox) in .env.local.")
  return { key, base: "https://api-sandbox.nowpayments.io/v1" }
}

export const E2E_PORT = 3100
export const BASE_URL = REMOTE ? (process.env.E2E_BASE_URL ?? "").replace(/\/$/, "") : `http://localhost:${E2E_PORT}`
if (REMOTE && !BASE_URL.startsWith("https://")) throw new Error("Set E2E_BASE_URL to the deployed site, for example https://multisimsusa.vercel.app")

export const PASSWORD = "e2e-pass-123456"

const inbox = process.env.E2E_INBOX ?? ""
if (REMOTE && !/^[^@+\s]+@[^@\s]+$/.test(inbox)) throw new Error("Set E2E_INBOX to a real inbox, for example you@gmail.com")
const [inboxUser, inboxDomain] = inbox.split("@")

/** A test address: @multisims.test locally, a plus-address of the real inbox remotely. */
export function testEmail(tag: string) {
  return REMOTE ? `${inboxUser}+e2e-${tag}@${inboxDomain}` : `e2e-${tag}@multisims.test`
}

/** SQL LIKE pattern matching every test address, for cleanup. */
export const TEST_EMAIL_PATTERN = REMOTE ? `${inboxUser}+e2e-%@${inboxDomain}` : "e2e-%@multisims.test"

export const OWNER = testEmail("owner")
export const AGENT = testEmail("agent")
export const DEALER_A = testEmail("dealer-a")
export const DEALER_B = testEmail("dealer-b")
