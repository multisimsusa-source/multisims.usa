// Retakes the product guide's screenshots (docs/product-guide/img) on the LOCAL stack with
// realistic test data, through the real app. Run against a local production build on :3100
// with the local Supabase keys in the environment:
//   node scripts/guide-shots.mjs
// It creates orders in the local database (example.com customers) and leaves them there.
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"

const SITE = "http://localhost:3100"
const IMG = fileURLToPath(new URL("../docs/product-guide/img/", import.meta.url))
const QR = fileURLToPath(new URL("../e2e/fixtures/qr-2.png", import.meta.url))
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
if (!/127\.0\.0\.1|localhost/.test(URL_)) throw new Error("Local Supabase only")
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PASS = "qa-pass-123456"
const OWNER = "qa-owner@multisims.local", AGENT = "qa-agent@multisims.local", DEALER = "qa-dealer@multisims.local"
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
const DESK = { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.25 }
const RUN = Date.now().toString(36).slice(-4)
const IMEI = "356938035643809", EID = "89049032004008882600000000000001"

const log = (...a) => console.log(...a)
const step = async (name, fn) => {
  try {
    await fn()
    log("ok  ", name)
  } catch (e) {
    log("FAIL", name, String(e.message ?? e).split("\n")[0].slice(0, 200))
  }
}

async function context(browser, opts) {
  const ctx = await browser.newContext({ ...opts, colorScheme: "light" })
  // Toasts and the Next dev indicator never belong in a guide picture.
  await ctx.addInitScript(() => {
    const css = "[data-sonner-toaster]{display:none!important}"
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style")
      s.textContent = css
      document.head.appendChild(s)
    })
  })
  return ctx
}
async function login(browser, email, opts) {
  const page = await (await context(browser, opts)).newPage()
  await page.goto(`${SITE}/portal/login`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/portal"), { timeout: 60000 })
  return page
}
const guest = async (browser) => (await context(browser, PHONE)).newPage()
const settle = (page) => page.waitForTimeout(900)
const toast = (page, text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first().waitFor({ state: "attached", timeout: 20000 })
const shot = async (page, file) => {
  // No hover tooltip or focus ring in the picture.
  await page.mouse.move(1, 400)
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await settle(page)
  await page.screenshot({ path: `${IMG}${file}`, type: "jpeg", quality: 86 })
}
async function pick(page, trigger, option) {
  await trigger.click()
  const opt = page.getByRole("option", { name: option }).first()
  await opt.waitFor({ timeout: 15000 })
  await opt.click()
}
async function contact(page, name, email) {
  await page.getByLabel("Full name").fill(name)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900123")
}
async function buyEsim(browser, slug, days, name, email, extra) {
  const g = await guest(browser)
  await g.goto(`${SITE}/checkout?plan=${slug}&days=${days}`)
  await contact(g, name, email)
  await g.getByLabel("US ZIP code").fill("10001")
  if (extra) await extra(g)
  await g.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
  await g.waitForURL(/\/order\//)
  return g
}
const orderOf = async (email) => (await db.from("orders").select("*").eq("customer_email", email).order("created_at", { ascending: false }).limit(1).single()).data
async function claim(agent, id) {
  await agent.goto(`${SITE}/agent/orders/${id}`)
  await agent.getByRole("button", { name: /^Claim/ }).first().click()
  await toast(agent, "Claimed")
}

async function seed() {
  const { data: dealer } = await db.from("profiles").select("id").eq("email", DEALER).single()
  await db.from("dealers").update({ company: "Coastline Wireless" }).eq("profile_id", dealer.id)
  await db.from("profiles").update({ full_name: "Daniel Reyes" }).eq("id", dealer.id)
  await db.from("profiles").update({ full_name: "Sara Malik" }).eq("email", AGENT)
  await db.from("profiles").update({ full_name: "Zafir" }).eq("email", OWNER)
  await db.from("wallet_ledger").insert({ dealer_id: dealer.id, kind: "manual_add", amount_cents: 150000, note: "Bank transfer, November" })
  return { dealerId: dealer.id }
}

const browser = await chromium.launch()
try {
  const { dealerId } = await seed()
  const owner = await login(browser, OWNER, DESK)
  // T-Mobile Unlimited Plus offered for refills, from the new Refills page.
  await step("refills on", async () => {
    await owner.goto(`${SITE}/admin/refills`)
    const sw = owner.getByRole("switch", { name: "Offer Unlimited Plus for refills" })
    if (!(await sw.isChecked())) {
      await sw.click()
      await toast(owner, "Offered for refills")
    }
  })

  // ---------------- Customers ----------------
  const maria = `maria.lopez.${RUN}@example.com`, james = `james.carter.${RUN}@example.com`
  const aisha = `aisha.khan.${RUN}@example.com`, leo = `leo.martin.${RUN}@example.com`
  await step("c1 home", async () => {
    const g = await guest(browser)
    await g.goto(SITE)
    await shot(g, "c1-home.jpg")
  })
  await step("c3 plan", async () => {
    const g = await guest(browser)
    await g.goto(`${SITE}/plans/mobilex-qa`)
    await g.getByText("eSIM or SIM card?").scrollIntoViewIfNeeded()
    await g.evaluate(() => window.scrollBy(0, -90))
    await shot(g, "c3-plan.jpg")
  })
  await step("c4 checkout", async () => {
    const g = await guest(browser)
    await g.goto(`${SITE}/checkout?plan=t-mobile-unlimited-plus-esim&days=30`)
    await contact(g, "Maria Lopez", maria)
    await g.getByLabel("US ZIP code").fill("10001")
    await g.locator("#imei_1").fill(IMEI)
    await g.locator("#eid_1").fill(EID)
    await g.getByText("Your phone (optional)").scrollIntoViewIfNeeded()
    await g.evaluate(() => window.scrollBy(0, -260))
    await shot(g, "c4-checkout.jpg")
    await g.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await g.waitForURL(/\/order\//)
  })
  await step("c5 processing", async () => {
    const g = await buyEsim(browser, "t-mobile-essentials-20gb-esim", 14, "James Carter", james, async (p) => {
      await p.getByRole("button", { name: /Increase|Add one/ }).first().click().catch(() => {})
    })
    await shot(g, "c5-order-processing.jpg")
  })
  await buyEsim(browser, "t-mobile-unlimited-plus-esim", 30, "Aisha Khan", aisha)
  await buyEsim(browser, "verizon-unlimited-welcome-esim", 7, "Leo Martin", leo)

  // ---------------- Agent: deliver Aisha (QR, number), Leo without QR ----------------
  const agent = await login(browser, AGENT, DESK)
  await step("deliver aisha", async () => {
    const o = await orderOf(aisha)
    await claim(agent, o.id)
    const form = agent.locator("form").filter({ has: agent.locator('input[name="phone_number"]') }).first()
    await form.locator('input[type="file"]').setInputFiles(QR)
    await form.getByLabel("Phone number").fill("+1 646 555 0144")
    await form.getByLabel("ICCID").fill("8901260000000000144")
    await form.getByRole("button", { name: /Save/ }).click()
    await toast(agent, /saved/i)
    await agent.getByRole("button", { name: "Mark complete and deliver" }).filter({ visible: true }).first().click()
    await agent.getByRole("alertdialog").getByRole("button", { name: "Deliver now" }).click()
    await toast(agent, "Delivered")
  })
  await step("deliver leo without QR", async () => {
    const o = await orderOf(leo)
    await claim(agent, o.id)
    await agent.getByRole("button", { name: "Mark complete and deliver" }).filter({ visible: true }).first().click()
    await agent.getByRole("alertdialog").getByRole("button", { name: "Deliver now" }).click()
    await toast(agent, "Delivered")
  })
  await step("c8 timer", async () => {
    const o = await orderOf(aisha)
    const g = await guest(browser)
    await g.goto(`${SITE}/order/${o.public_token}`)
    const card = g.locator("section[aria-labelledby='sims'] > div, section[aria-labelledby='sims'] li").filter({ hasText: "Active until" }).first()
    await card.waitFor({ timeout: 20000 })
    await card.scrollIntoViewIfNeeded()
    await settle(g)
    await card.screenshot({ path: `${IMG}c8-timer.jpg`, type: "jpeg", quality: 86 })
  })
  await step("c7 refill", async () => {
    const o = await orderOf(aisha)
    const g = await guest(browser)
    await g.goto(`${SITE}/order/${o.public_token}`)
    await g.getByRole("link", { name: "Refill this number" }).first().click()
    await g.waitForURL(/\/refill/)
    await pick(g, g.locator("#plan-choice"), /Unlimited Plus/)
    await pick(g, g.locator("#days-choice"), /^30 days/)
    await g.locator("#plan-choice").scrollIntoViewIfNeeded()
    await g.evaluate(() => window.scrollBy(0, -320))
    await shot(g, "c7-refill.jpg")
    await g.getByRole("button", { name: "Refill my number" }).filter({ visible: true }).first().click()
    await g.waitForURL(/\/order\//)
  })

  // ---------------- Agent: Maria in progress, queue, refill ----------------
  await step("a2 workspace", async () => {
    const o = await orderOf(maria)
    await claim(agent, o.id)
    const form = agent.locator("form").filter({ has: agent.locator('input[name="phone_number"]') }).first()
    await form.locator('input[type="file"]').setInputFiles(QR)
    await form.getByLabel("Phone number").fill("+1 212 555 0187")
    await form.getByLabel("ICCID").fill("8901260000000000187")
    await form.getByRole("button", { name: /Save/ }).click()
    await toast(agent, /saved/i)
    await agent.reload()
    await agent.getByText("Buyer's phone").waitFor({ timeout: 20000 })
    await shot(agent, "a2-workspace-esim.jpg")
  })

  // ---------------- Dealer ----------------
  const dealer = await login(browser, DEALER, DESK)
  await step("d2 new order", async () => {
    await dealer.goto(`${SITE}/dealer/new`)
    await pick(dealer, dealer.locator('[id^="plan-"]').nth(0), /T-Mobile Unlimited Plus \(eSIM\)/)
    await pick(dealer, dealer.locator('[id^="days-"]').nth(0), /^30 days/)
    await dealer.getByLabel("Quantity").nth(0).fill("25")
    await dealer.getByLabel("Quantity").nth(0).blur()
    await dealer.locator('[id^="zip-"]').nth(0).fill("33101")
    await dealer.locator('[id^="area-"]').nth(0).fill("305")
    await dealer.getByRole("button", { name: "Add line" }).click()
    await pick(dealer, dealer.locator('[id^="plan-"]').nth(1), /Mobile X \$50 Plan/)
    await pick(dealer, dealer.locator('[id^="days-"]').nth(1), /^30 days/)
    await dealer.locator("label").filter({ hasText: /^SIM card$/ }).first().click()
    await dealer.locator("label").filter({ hasText: "I already have the SIM cards" }).first().click()
    await dealer.getByLabel("Quantity").nth(1).fill("3")
    await dealer.getByLabel("Quantity").nth(1).blur()
    await dealer.locator('[id^="devices-"]').nth(1).fill("8901260000000000301\n8901260000000000302\n8901260000000000303")
    await dealer.locator('[id^="plan-"]').nth(1).scrollIntoViewIfNeeded()
    await dealer.evaluate(() => window.scrollBy(0, -140))
    await shot(dealer, "d2-new-order.jpg")
    await dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await dealer.waitForURL(/\/dealer\/orders\//, { timeout: 30000 })
  })
  await step("d4 dealer refill", async () => {
    await dealer.goto(`${SITE}/dealer/refill`)
    await pick(dealer, dealer.locator('[id^="plan-"]').nth(0), /Unlimited Plus/)
    await pick(dealer, dealer.locator('[id^="days-"]').nth(0), /^30 days/)
    await dealer.locator('[id^="numbers-"]').nth(0).fill(
      "(305) 555-0101, 8901260000000001101\n(305) 555-0102\n(305) 555-0103, 8901260000000001103\n(786) 555-0104\n(786) 555-0105"
    )
    await shot(dealer, "d4-refill.jpg")
  })
  await step("d1 overview", async () => {
    await dealer.goto(`${SITE}/dealer`)
    await shot(dealer, "d1-overview.jpg")
  })

  await step("a1 queue", async () => {
    await agent.goto(`${SITE}/agent`)
    await agent.getByRole("region", { name: "Waiting" }).waitFor({ timeout: 20000 })
    await shot(agent, "a1-queue.jpg")
  })
  await step("a3 refill workspace", async () => {
    const { data: r } = await db.from("orders").select("id").eq("customer_email", aisha).eq("kind", "refill").order("created_at", { ascending: false }).limit(1).single()
    await claim(agent, r.id)
    await agent.reload()
    await shot(agent, "a3-workspace-refill.jpg")
  })

  // ---------------- Owner ----------------
  await step("o1 overview", async () => {
    await owner.goto(`${SITE}/admin`)
    await owner.getByRole("heading", { name: "Overview" }).waitFor()
    await shot(owner, "o1-overview.jpg")
  })
  await step("o3 plan", async () => {
    const { data: p } = await db.from("plans").select("id").eq("slug", "t-mobile-unlimited-plus-esim").single()
    await owner.goto(`${SITE}/admin/plans/${p.id}`)
    await owner.getByText("These prices are used for new orders and for refills.").waitFor()
    await shot(owner, "o3-plan.jpg")
  })
  await step("o5 dealer", async () => {
    await owner.goto(`${SITE}/admin/dealers/${dealerId}`)
    await owner.getByText("Wallet").first().waitFor()
    await shot(owner, "o5-dealer.jpg")
  })
} finally {
  await browser.close()
}
