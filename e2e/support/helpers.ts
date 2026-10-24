import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"

import { db, resetRateLimits } from "./db"
import { BASE_URL, PASSWORD, paymentsSandbox, REMOTE } from "./env"
import { AUTH } from "./global-setup"

export { AUTH }

// Every context a test opens is closed after it, so pages from earlier tests stop polling.
const open: BrowserContext[] = []
test.afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close().catch(() => {})))
})

async function newContext(browser: Browser, options: Parameters<Browser["newContext"]>[0]) {
  const context = await browser.newContext(options)
  open.push(context)
  return context
}

export const PHONE = { width: 375, height: 812 }
export const DESKTOP = { width: 1280, height: 900 }

/** A page signed in as the seeded owner or agent. */
export async function pageAs(browser: Browser, who: keyof typeof AUTH, viewport = DESKTOP) {
  const context = await newContext(browser, { baseURL: BASE_URL, storageState: AUTH[who], viewport })
  const page = await context.newPage()
  watchErrors(page)
  return page
}

/** A guest (customer) page. */
export async function guestPage(browser: Browser, viewport = PHONE) {
  const context = await newContext(browser, { baseURL: BASE_URL, viewport })
  const page = await context.newPage()
  watchErrors(page)
  return page
}

/** Signs in through the login form (dealers, created during the run). */
export async function signIn(browser: Browser, email: string, viewport = DESKTOP) {
  // The login form is rate limited per address; tests sign in often. Local stack only.
  await resetRateLimits()
  const context = await newContext(browser, { baseURL: BASE_URL, viewport })
  const page = await context.newPage()
  watchErrors(page)
  await page.goto("/portal/login")
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith("/portal"), { timeout: 60_000 })
  return page
}

/**
 * Fails the test on any uncaught error in the page, and makes navigation wait for the
 * document rather than every resource (portal pages hold a live connection open).
 */
export function watchErrors(page: Page) {
  const goto = page.goto.bind(page)
  const reload = page.reload.bind(page)
  page.goto = async (url, options) => {
    const response = await goto(url, { waitUntil: "domcontentloaded", ...options })
    await streamed(page)
    return response
  }
  page.reload = async (options) => {
    const response = await reload({ waitUntil: "domcontentloaded", ...options })
    await streamed(page)
    return response
  }
  page.on("pageerror", (error) => {
    throw new Error(`Page error on ${page.url()}: ${error.message}`)
  })
}

/**
 * Streamed parts of a page arrive as hidden blocks that React then moves into place; until
 * it does, a text can briefly exist twice. Wait until every streamed block has landed.
 */
async function streamed(page: Page) {
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15_000 }).catch(() => {})
}

/**
 * Waits for a new toast containing the text. A matched toast is marked as seen, so the next
 * check can never pass on an earlier toast that is still on screen.
 */
export async function expectToast(page: Page, text: string | RegExp) {
  const toast = page.locator("[data-sonner-toast]:not([data-e2e-seen])").filter({ hasText: text }).first()
  await expect(toast).toBeVisible()
  await toast.evaluate((el) => el.setAttribute("data-e2e-seen", "1")).catch(() => {})
}

/** Opens a Select by its trigger and picks an option by name. */
export async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name: option }).first().click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

/** No sideways scrolling: the layout fits the viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0)
}

export async function orderFor(email: string) {
  const { data } = await db().from("orders").select("*").eq("customer_email", email).is("replacement_of", null).order("created_at", { ascending: false }).limit(1).single()
  return data as { id: string; number: number; public_token: string; status: string; total_cents: number; discount_cents: number; unit_price_cents: number; quantity: number }
}

/** Confirms an alert dialog (ConfirmAction) by its confirm button name. */
export async function confirm(page: Page, name: string | RegExp) {
  await page.getByRole("alertdialog").getByRole("button", { name }).click()
}

/**
 * With a payment provider (the deployed site, in the provider's sandbox): the buyer pays the
 * newest open invoice for an order or a dealer top-up, with the outcome chosen. The provider
 * then calls the site's webhook as for a real payment. Locally there is no provider and
 * orders are already in the queue, so this does nothing.
 */
export async function payInSandbox(match: { orderId?: string; dealerId?: string }, outcome: "success" | "partially_paid" = "success") {
  if (!REMOTE) return
  const client = db()
  let query = client.from("payments").select("id, provider_invoice_id").not("provider_invoice_id", "is", null).order("created_at", { ascending: false }).limit(1)
  query = match.orderId ? query.eq("order_id", match.orderId) : query.eq("dealer_id", match.dealerId!)
  let invoice: string | null = null
  await expect
    .poll(async () => {
      invoice = ((await query.maybeSingle()).data?.provider_invoice_id as string | undefined) ?? null
      return invoice
    }, { message: "no invoice was created" })
    .toBeTruthy()
  const { key, base } = paymentsSandbox()
  const res = await fetch(`${base}/invoice-payment`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ iid: Number(invoice), pay_currency: "usdttrc20", case: outcome }),
  })
  if (!res.ok) throw new Error(`Sandbox payment failed: ${res.status} ${await res.text()}`)
}

/** Waits (up to three minutes: sandbox webhooks can be slow) until the order leaves awaiting payment. */
export async function expectPaid(orderId: string) {
  await expect
    .poll(async () => (await db().from("orders").select("status").eq("id", orderId).single()).data?.status, { timeout: 180_000, intervals: [2_000, 5_000] })
    .not.toBe("awaiting_payment")
}
