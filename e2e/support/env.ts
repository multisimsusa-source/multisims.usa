import { execSync } from "node:child_process"

/**
 * The local Supabase stack's URL and keys, read from `supabase status`. End-to-end tests
 * only ever run against this local stack: never the client's project.
 */
export function localSupabase() {
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

export function assertLocal(url: string) {
  const host = new URL(url).hostname
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run end-to-end tests against ${host}. They only run on the local Supabase stack.`)
  }
}

export const E2E_PORT = 3100
export const BASE_URL = `http://localhost:${E2E_PORT}`
export const PASSWORD = "e2e-pass-123456"
export const DOMAIN = "multisims.test"
export const OWNER = `e2e-owner@${DOMAIN}`
export const AGENT = `e2e-agent@${DOMAIN}`
export const DEALER_A = `e2e-dealer-a@${DOMAIN}`
export const DEALER_B = `e2e-dealer-b@${DOMAIN}`
