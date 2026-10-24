import { defineConfig, devices } from "@playwright/test"

import { BASE_URL, E2E_PORT, REMOTE, supabaseTarget } from "./e2e/support/env"

/**
 * End-to-end tests: the whole product driven through the browser, against the LOCAL
 * Supabase stack only (`supabase start`). The app runs with email and payments switched
 * off, so nothing leaves the machine. Setup seeds an owner and an agent login; teardown
 * removes everything the run created.
 *
 *   bun run test:e2e
 */
const supabase = supabaseTarget()

export default defineConfig({
  testDir: "./e2e",
  // One shared database: the flows build on each other, so they run in order.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  // Remote runs test the deployed site as it is; locally Playwright builds and starts the app.
  webServer: REMOTE
    ? undefined
    : {
        // The production build, as it ships (no on-demand compiling, real caching).
        command: `bunx next build && bunx next start --port ${E2E_PORT}`,
        url: `${BASE_URL}/`,
        reuseExistingServer: true,
        timeout: 600_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: supabase.url,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.publishable,
          SUPABASE_SERVICE_ROLE_KEY: supabase.secret,
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          // Nothing leaves the machine: no email, no payment provider, no captcha.
          RESEND_API_KEY: "",
          NOWPAYMENTS_API_KEY: "",
          NOWPAYMENTS_IPN_SECRET: "",
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
          TURNSTILE_SECRET_KEY: "",
          SHOW_DESIGN_SYSTEM: "1",
        },
      },
})
