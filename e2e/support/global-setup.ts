import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

import { cleanupTestData, resetRateLimits, seedTestUsers } from "./db"
import { AGENT, BASE_URL, OWNER, PASSWORD } from "./env"

export const AUTH = { owner: "e2e/.auth/owner.json", agent: "e2e/.auth/agent.json" }

/**
 * Start clean, seed the owner and agent logins, and sign each in once.
 * E2E_REUSE=1 keeps the data of a previous run (with E2E_KEEP=1) to debug one file.
 */
export default async function globalSetup() {
  if (process.env.E2E_REUSE !== "1") {
    await cleanupTestData()
    await seedTestUsers()
  }
  await resetRateLimits()
  mkdirSync("e2e/.auth", { recursive: true })

  const browser = await chromium.launch()
  for (const [email, file] of [
    [OWNER, AUTH.owner],
    [AGENT, AUTH.agent],
  ] as const) {
    const context = await browser.newContext({ baseURL: BASE_URL })
    const page = await context.newPage()
    await page.goto("/portal/login")
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.startsWith("/portal"), { timeout: 60_000 })
    await context.storageState({ path: file })
    await context.close()
  }
  await browser.close()
}
