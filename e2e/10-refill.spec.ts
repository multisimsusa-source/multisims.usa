import { expect, test, type Page } from "@playwright/test"

import { db, resetRateLimits } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, confirm, expectNoHorizontalScroll, expectToast, guestPage, orderButton, pageAs, PHONE, signIn, submitAndPay } from "./support/helpers"

/**
 * Refill (agreed 26 Oct): add days to a number, starting the day after its current plan
 * when that is still running; activate a SIM card bought on its own; the plan timer on
 * every activated line. Builds on E2E Mobile and its plans from 01-catalog.
 */

const ESIM_BUYER = testEmail("timer")
const STRANGER = testEmail("refill-stranger")
const CARD_BUYER = testEmail("activate")
const DEALER = testEmail("refill-dealer")
const COMPANY = "Refill Partners"
const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const FIX = (name: string) => `e2e/fixtures/${name}`

function usToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function shown(date: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
}

async function plan(name: string) {
  const { data } = await db()
    .from("plans")
    .select("id, slug, product_type, carrier_id, packages:day_packages(id, days, price_cents, sale_price_cents, wholesale_price_cents)")
    .eq("name", name)
    .single()
  return data as {
    id: string
    slug: string
    product_type: string
    carrier_id: string
    packages: { id: string; days: number; price_cents: number; sale_price_cents: number | null; wholesale_price_cents: number | null }[]
  }
}
const pays = (p: { price_cents: number; sale_price_cents: number | null }) =>
  p.sale_price_cents !== null && p.sale_price_cents < p.price_cents ? p.sale_price_cents : p.price_cents

/** A paid website order waiting in the queue, as checkout leaves it. */
async function queuedOrder(kind: "esim" | "card_only", email: string) {
  const unlimited = await plan(kind === "esim" ? "E2E Unlimited" : "E2E Card")
  const pkg = unlimited.packages.find((p) => p.days === 7)!
  const { data: carrier } = await db().from("carriers").select("id, name").eq("name", "E2E Mobile").single()
  const { data: order } = await db()
    .from("orders")
    .insert({
      channel: "website",
      kind: kind === "esim" ? "line" : "card_only",
      customer_name: "Lina Park",
      customer_email: email,
      customer_phone: "+44 7700 900123",
      zip_code: "10001",
      shipping_address: kind === "card_only" ? { line1: "1 Test St", city: "New York", state: "NY", zip: "10001" } : null,
      carrier_id: carrier!.id,
      carrier_name: carrier!.name,
      plan_id: kind === "esim" ? unlimited.id : null,
      day_package_id: kind === "esim" ? pkg.id : null,
      plan_name: kind === "esim" ? "E2E Unlimited" : null,
      days: kind === "esim" ? 7 : null,
      product_type: kind === "esim" ? "esim" : "physical",
      quantity: 1,
      unit_price_cents: kind === "esim" ? pays(pkg) : 0,
      sim_card_price_cents: kind === "card_only" ? 600 : 0,
      total_cents: 2000,
      status: kind === "esim" ? "queued" : "fulfilled",
      paid_at: new Date().toISOString(),
      shipped_at: kind === "card_only" ? new Date().toISOString() : null,
      fulfilled_at: kind === "card_only" ? new Date().toISOString() : null,
    })
    .select("id, number, public_token")
    .single()
  await db()
    .from("order_items")
    .insert({
      order_id: order!.id,
      seq: 1,
      status: kind === "esim" ? "pending" : "fulfilled",
      iccid: kind === "card_only" ? "8901410000000000777" : null,
      tracking_number: kind === "card_only" ? "9400111899223344557777" : null,
      fulfilled_at: kind === "card_only" ? new Date().toISOString() : null,
    })
  return order as { id: string; number: number; public_token: string }
}

async function latestOrder(email: string, kind: string) {
  const { data } = await db().from("orders").select("id, number, public_token, total_cents, discount_cents, addon_price_cents, kind, product_type, days").eq("customer_email", email).eq("kind", kind).order("created_at", { ascending: false }).limit(1).single()
  return data!
}

async function itemsOf(orderId: string) {
  const { data } = await db().from("order_items").select("id, status, phone_number, iccid, plan_starts_on, plan_ends_on, refill_of_item").eq("order_id", orderId).order("seq")
  return data ?? []
}

async function claimAndOpen(agent: Page, orderId: string) {
  await agent.goto(`/agent/orders/${orderId}`)
  await agent.getByRole("button", { name: /^Claim/ }).first().click()
  await expectToast(agent, "Claimed")
}

/**
 * The deployed site's minimum can be higher than the local one (the payment provider sets a
 * floor): when the order is under it, add international calling as a customer would.
 */
async function overMinimum(page: Page) {
  if (await page.getByText(/Minimum order is/).filter({ visible: true }).count()) {
    await page.getByRole("switch").first().click()
    await expect(page.getByText(/Minimum order is/).filter({ visible: true })).toHaveCount(0)
  }
}

async function fillRefillContact(page: Page, email: string) {
  await page.getByLabel("Full name").fill("Sam Rivera")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900456")
}

test.describe.serial("Refill and the plan timer", () => {
  // Many refills from one address in one run: keep the per-address limit out of the way.
  test.beforeEach(async () => {
    await resetRateLimits()
  })

  test("owner offers E2E Unlimited and E2E Card for refills", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    for (const name of ["E2E Unlimited", "E2E Card"]) {
      const p = await plan(name)
      await owner.goto(`/admin/plans/${p.id}`)
      await owner.getByRole("switch", { name: "Offer for refills" }).click()
      await owner.getByRole("button", { name: "Save plan" }).click()
      await expectToast(owner, /saved/i)
      await expect.poll(async () => (await db().from("plans").select("refillable").eq("id", p.id).single()).data?.refillable).toBe(true)
    }
  })

  test("an eSIM delivered today starts its timer; the customer sees it and can refill", async ({ browser }) => {
    const order = await queuedOrder("esim", ESIM_BUYER)
    const agent = await pageAs(browser, "agent")
    await claimAndOpen(agent, order.id)
    await agent.locator('form input[type="file"]').first().setInputFiles(FIX("qr-1.png"))
    await agent.getByLabel("Phone number", { exact: true }).fill("+1 (646) 555-0144")
    await agent.getByRole("button", { name: "Save QR and details" }).click()
    await expectToast(agent, "QR code saved")
    await agent.reload()
    await agent.getByRole("button", { name: "Mark complete and deliver" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expectToast(agent, "Delivered")

    const today = usToday()
    const [item] = await itemsOf(order.id)
    expect(item).toMatchObject({ plan_starts_on: today, plan_ends_on: addDays(today, 6) })

    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByText(`Active until ${shown(addDays(today, 6))}, 7 days left`)).toBeVisible()
    await expect(customer.getByRole("link", { name: "Refill this number" })).toBeVisible()
    await customer.screenshot({ path: `${SHOTS}/p3-timer-phone.png`, fullPage: true })
  })

  test("Refill this number opens the form filled in; below the minimum is blocked", async ({ browser }) => {
    const { data: original } = await db().from("orders").select("public_token").eq("customer_email", ESIM_BUYER).eq("kind", "line").single()
    const page = await guestPage(browser)
    await page.goto(`/order/${original!.public_token}`)
    await page.getByRole("link", { name: "Refill this number" }).click()
    await page.waitForURL(/\/refill\?from=/)
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue("+1 (646) 555-0144")
    await expect(page.getByLabel("Full name")).toHaveValue("Lina Park")
    await expect(page.locator("#carrier-choice")).toContainText("E2E Mobile")

    // 7 days of E2E Unlimited plus the network fee is under the minimum.
    const unlimited = await plan("E2E Unlimited")
    const { data: settings } = await db().from("settings").select("network_fee_cents, min_order_cents").single()
    await choose(page, page.locator("#plan-choice"), "E2E Unlimited")
    await choose(page, page.locator("#days-choice"), /^7 days/)
    const seven = pays(unlimited.packages.find((p) => p.days === 7)!) + settings!.network_fee_cents
    if (seven < settings!.min_order_cents) {
      await expect(page.getByText(/Minimum order is/).filter({ visible: true }).first()).toBeVisible()
      await expect(orderButton(page, "Refill my number")).toBeDisabled()
    }
    await choose(page, page.locator("#days-choice"), /^30 days/)
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/p3-refill-form-phone.png`, fullPage: true })
    await submitAndPay(page, "Refill my number", ESIM_BUYER)
    await expect(page.getByText("Refill, 30 days")).toBeVisible()
    await expect(page.getByText("Processing").first()).toBeVisible()

    const refill = await latestOrder(ESIM_BUYER, "refill")
    expect(refill.total_cents).toBe(pays(unlimited.packages.find((p) => p.days === 30)!) + settings!.network_fee_cents)
    const { data: originalItem } = await db().from("order_items").select("id").eq("phone_number", "+1 (646) 555-0144").eq("status", "fulfilled").single()
    const [item] = await itemsOf(refill.id)
    expect(item).toMatchObject({ phone_number: "+1 (646) 555-0144", refill_of_item: originalItem!.id, status: "pending" })
  })

  test("the agent sees the current end and the proposal; the refill starts the day after", async ({ browser }) => {
    const refill = await latestOrder(ESIM_BUYER, "refill")
    const today = usToday()
    const currentEnd = addDays(today, 6)
    const agent = await pageAs(browser, "agent")
    await agent.goto("/agent")
    await expect(agent.getByRole("listitem").filter({ hasText: `MS-${refill.number}` }).getByText("Refill", { exact: true })).toBeVisible()
    await claimAndOpen(agent, refill.id)
    await expect(agent.getByText(`Current plan ends: ${shown(currentEnd)}`)).toBeVisible()
    await expect(agent.getByLabel("Plan starts")).toHaveValue(addDays(currentEnd, 1))
    await expect(agent.getByLabel("Plan ends")).toHaveValue(addDays(currentEnd, 30))
    await agent.screenshot({ path: `${SHOTS}/p3-agent-refill.png`, fullPage: true })
    await agent.getByRole("button", { name: "Mark refilled and deliver" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expectToast(agent, /Delivered|shipped|active/i)

    const [item] = await itemsOf(refill.id)
    expect(item).toMatchObject({ status: "fulfilled", plan_starts_on: addDays(currentEnd, 1), plan_ends_on: addDays(currentEnd, 30) })

    const { data: original } = await db().from("orders").select("public_token").eq("customer_email", ESIM_BUYER).eq("kind", "line").single()
    const customer = await guestPage(browser)
    await customer.goto(`/order/${original!.public_token}`)
    await expect(customer.getByText(`Active until ${shown(currentEnd)}, 7 days left`)).toBeVisible()
    await expect(customer.getByText(`Next plan starts ${shown(addDays(currentEnd, 1))}, until ${shown(addDays(currentEnd, 30))}`)).toBeVisible()
    await customer.goto(`/order/${refill.public_token}`)
    await expect(customer.getByText("Delivered").first()).toBeVisible()
    await expect(customer.getByText(`Plan starts ${shown(addDays(currentEnd, 1))}`)).toBeVisible()
    await customer.screenshot({ path: `${SHOTS}/p3-refill-delivered-phone.png`, fullPage: true })
  })

  test("a number bought elsewhere: unknown end, the agent sets the dates; calling and a code apply", async ({ browser }) => {
    await db().from("discount_codes").insert({ code: "E2EREFILL", kind: "percent", value: 10, active: true })
    const page = await guestPage(browser)
    await page.goto("/refill")
    await choose(page, page.locator("#carrier-choice"), "E2E Mobile")
    await page.getByLabel("Phone number", { exact: true }).fill("+1 646 555 0177")
    await choose(page, page.locator("#plan-choice"), "E2E Unlimited")
    await choose(page, page.locator("#days-choice"), /^30 days/)
    const { data: addon } = await db().from("addons").select("price_cents, active").eq("code", "intl_calling").single()
    if (addon?.active) await page.getByRole("switch").first().click()
    await page.getByRole("button", { name: "Have a discount code?" }).click()
    await page.getByLabel("Discount code").fill("E2EREFILL")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(page.getByText("Discount (E2EREFILL)")).toBeVisible()
    await fillRefillContact(page, STRANGER)
    await submitAndPay(page, "Refill my number", STRANGER)

    const refill = await latestOrder(STRANGER, "refill")
    expect(refill.discount_cents).toBeGreaterThan(0)
    if (addon?.active) expect(refill.addon_price_cents).toBe(addon.price_cents)
    const [pending] = await itemsOf(refill.id)
    expect(pending.refill_of_item).toBeNull()

    const today = usToday()
    const agent = await pageAs(browser, "agent")
    await claimAndOpen(agent, refill.id)
    await expect(agent.getByText(/Unknown, the number is not in our records/)).toBeVisible()
    await expect(agent.getByLabel("Plan starts")).toHaveValue(today)
    await agent.getByLabel("Plan starts").fill(addDays(today, 3))
    await agent.getByLabel("Plan ends").fill(addDays(today, 32))
    await agent.getByRole("button", { name: "Save dates" }).click()
    await expectToast(agent, "Dates saved")
    await agent.getByRole("button", { name: "Mark refilled and deliver" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expectToast(agent, /Delivered|active/i)
    const [item] = await itemsOf(refill.id)
    expect(item).toMatchObject({ plan_starts_on: addDays(today, 3), plan_ends_on: addDays(today, 32) })
  })

  test("a number whose plan already ended is refilled from today", async ({ browser }) => {
    const ended = await queuedOrder("esim", testEmail("expired"))
    const today = usToday()
    await db().from("order_items").update({ status: "fulfilled", phone_number: "+1 718 555 0101", plan_starts_on: addDays(today, -40), plan_ends_on: addDays(today, -10), fulfilled_at: new Date().toISOString() }).eq("order_id", ended.id)
    await db().from("orders").update({ status: "fulfilled" }).eq("id", ended.id)

    const page = await guestPage(browser)
    await page.goto(`/order/${ended.public_token}`)
    await expect(page.getByText(`Plan ended ${shown(addDays(today, -10))}`)).toBeVisible()
    await page.getByRole("link", { name: "Refill this number" }).click()
    await choose(page, page.locator("#plan-choice"), "E2E Unlimited")
    await choose(page, page.locator("#days-choice"), /^30 days/)
    await submitAndPay(page, "Refill my number", testEmail("expired"))

    const refill = await latestOrder(testEmail("expired"), "refill")
    const agent = await pageAs(browser, "agent")
    await claimAndOpen(agent, refill.id)
    await expect(agent.getByText(`Current plan ends: ${shown(addDays(today, -10))}`)).toBeVisible()
    await expect(agent.getByLabel("Plan starts")).toHaveValue(today)
    await expect(agent.getByLabel("Plan ends")).toHaveValue(addDays(today, 29))
  })

  test("a SIM card number is refilled with a SIM card plan (nothing is posted)", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto("/refill")
    await choose(page, page.locator("#carrier-choice"), "E2E Mobile")
    await page.getByLabel("Phone number", { exact: true }).fill("+1 347 555 0123")
    await page.getByLabel(/^ICCID/).fill("8901410000000000888")
    await choose(page, page.locator("#plan-choice"), "E2E Card")
    await fillRefillContact(page, testEmail("card-refill"))
    await overMinimum(page)
    await submitAndPay(page, "Refill my number", testEmail("card-refill"))
    await expect(page.getByText("Refill, 7 days")).toBeVisible()
    // A refill never ships: no tracker step for it, no address on it.
    await expect(page.getByText("Shipped")).toHaveCount(0)
    await expect(page.locator("main").getByText("Shipping", { exact: true })).toHaveCount(0)
    const refill = await latestOrder(testEmail("card-refill"), "refill")
    expect(refill.product_type).toBe("physical")
  })

  test("the server refuses a bad number and a plan not offered for refills", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto("/refill")
    await choose(page, page.locator("#carrier-choice"), "E2E Mobile")
    await page.getByLabel("Phone number", { exact: true }).fill("12345")
    await choose(page, page.locator("#plan-choice"), "E2E Unlimited")
    await choose(page, page.locator("#days-choice"), /^30 days/)
    await fillRefillContact(page, testEmail("refill-bad"))
    await orderButton(page, "Refill my number").click()
    await expect(page.getByText("Enter the US number, for example (212) 555-0100")).toBeVisible()

    // A plan switched off for refills, sent anyway.
    const unlimited = await plan("E2E Unlimited")
    await db().from("plans").update({ refillable: false }).eq("id", unlimited.id)
    try {
      await page.getByLabel("Phone number", { exact: true }).fill("+1 646 555 0188")
      await orderButton(page, "Refill my number").click()
      await expect(page.getByText("This plan is no longer offered for refills. Choose another plan.")).toBeVisible()
      const { count } = await db().from("orders").select("id", { count: "exact", head: true }).eq("customer_email", testEmail("refill-bad"))
      expect(count).toBe(0)
    } finally {
      await db().from("plans").update({ refillable: true }).eq("id", unlimited.id)
    }
  })

  test("a SIM card bought on its own is activated from its order page", async ({ browser }) => {
    const card = await queuedOrder("card_only", CARD_BUYER)
    const page = await guestPage(browser)
    await page.goto(`/order/${card.public_token}`)
    await page.getByRole("link", { name: "Activate this SIM" }).click()
    await page.waitForURL(/\/refill\?mode=activate/)
    await expect(page.getByLabel(/^ICCID/)).toHaveValue("8901410000000000777")
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveCount(0)
    await choose(page, page.locator("#plan-choice"), "E2E Card")
    await page.getByLabel("US ZIP code").fill("10001")
    await page.getByLabel(/^Area code/).fill("212")
    await page.screenshot({ path: `${SHOTS}/p3-activate-form-phone.png`, fullPage: true })
    await overMinimum(page)
    await submitAndPay(page, "Activate my SIM", CARD_BUYER)
    await expect(page.getByText(/SIM card activation, 7 days/)).toBeVisible()

    const activation = await latestOrder(CARD_BUYER, "activation")
    expect(activation).toMatchObject({ product_type: "physical", days: 7 })
    const agent = await pageAs(browser, "agent")
    await claimAndOpen(agent, activation.id)
    await expect(agent.getByLabel("ICCID", { exact: true })).toHaveValue("8901410000000000777")
    await agent.getByLabel("Phone number", { exact: true }).fill("+1 212 555 0190")
    await agent.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await agent.getByRole("button", { name: "Mark active and deliver" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expectToast(agent, "Line active")

    const today = usToday()
    const [item] = await itemsOf(activation.id)
    expect(item).toMatchObject({ status: "fulfilled", plan_starts_on: today, plan_ends_on: addDays(today, 6) })
    await page.reload()
    await expect(page.getByText("Delivered").first()).toBeVisible()
    await expect(page.getByText(`Active until ${shown(addDays(today, 6))}, 7 days left`)).toBeVisible()
  })

  test("dealer refills 50 numbers at once: held, taken per number, released when cancelled", async ({ browser }) => {
    const { data: profile } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    const dealerId = profile.user!.id
    await db().from("profiles").insert({ id: dealerId, role: "dealer", email: DEALER, full_name: "Refill Buyer", active: true })
    await db().from("dealers").insert({ profile_id: dealerId, company: COMPANY })
    await db().from("wallet_ledger").insert({ dealer_id: dealerId, kind: "manual_add", amount_cents: 1_000_000, note: "E2E funds" })

    const page = await signIn(browser, DEALER, PHONE)
    await page.goto("/dealer/refill")
    const fifty = Array.from({ length: 50 }, (_, i) => `+1 917 555 ${String(1000 + i)}`).join("\n")
    await choose(page, page.locator('[id^="plan-"]').nth(0), /E2E Unlimited/)
    await choose(page, page.locator('[id^="days-"]').nth(0), /^30 days/)
    await page.locator('[id^="numbers-"]').nth(0).fill(fifty)
    await expect(page.getByText(/50 numbers/).first()).toBeVisible()
    await page.getByRole("button", { name: "Add line" }).click()
    await choose(page, page.locator('[id^="plan-"]').nth(1), /E2E Unlimited/)
    await choose(page, page.locator('[id^="days-"]').nth(1), /^7 days/)
    await page.locator('[id^="numbers-"]').nth(1).fill("+1 917 555 2001, 8901260000000002001\nnot a number")
    await expect(page.getByText(/Row 2 is not a US number/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Place refill" }).filter({ visible: true }).first()).toBeDisabled()
    await page.locator('[id^="numbers-"]').nth(1).fill("+1 917 555 2001, 8901260000000002001")
    await page.getByLabel(/Reference/).fill("REFILL-50")
    await page.screenshot({ path: `${SHOTS}/p3-dealer-refill-phone.png`, fullPage: true })
    await page.getByRole("button", { name: "Place refill" }).filter({ visible: true }).first().click()
    await page.waitForURL(/\/dealer\/orders\/[0-9a-f-]{36}/)

    const unlimited = await plan("E2E Unlimited")
    const price = (days: number) => unlimited.packages.find((p) => p.days === days)!.wholesale_price_cents!
    const { data: batch } = await db().from("order_batches").select("id, total_cents").eq("reference", "REFILL-50").single()
    expect(batch!.total_cents).toBe(50 * price(30) + price(7))
    const { data: lines } = await db().from("orders").select("id, kind, quantity, days").eq("batch_id", batch!.id).order("number")
    expect(lines).toEqual([
      expect.objectContaining({ kind: "refill", quantity: 50, days: 30 }),
      expect.objectContaining({ kind: "refill", quantity: 1, days: 7 }),
    ])
    const wallet = async () => (await db().rpc("dealer_wallet", { p_dealer_id: dealerId })).data[0]
    expect(Number((await wallet()).reserved_cents)).toBe(batch!.total_cents)

    // The agent refills the 50-number line in one go: each number is taken as it is done.
    const agent = await pageAs(browser, "agent")
    await claimAndOpen(agent, lines![0].id)
    await agent.getByRole("button", { name: "Mark refilled and deliver" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expect.poll(async () => Number((await wallet()).reserved_cents)).toBe(price(7))
    const done = await itemsOf(lines![0].id)
    expect(done.every((i) => i.status === "fulfilled" && i.plan_starts_on === usToday())).toBe(true)

    // The owner cancels the other line: its hold comes back.
    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${lines![1].id}`)
    await owner.getByRole("button", { name: /Cancel order/ }).first().click()
    await owner.getByRole("dialog").getByRole("textbox").fill("Number not ours any more")
    await owner.getByRole("dialog").getByRole("button", { name: /Cancel order/ }).click()
    await expect.poll(async () => Number((await wallet()).reserved_cents)).toBe(0)
    expect(Number((await wallet()).balance_cents)).toBe(1_000_000 - 50 * price(30))

    // The dealer sees every refilled number with its dates.
    await page.reload()
    await expect(page.getByText(new RegExp(`Active until ${shown(addDays(usToday(), 29))}`)).first()).toBeVisible()
    await page.goto("/dealer/activations?q=917 555 1000")
    await expect(page.getByText(shown(addDays(usToday(), 29))).first()).toBeVisible()
    const csv = await page.request.get("/dealer/activations/export")
    expect(await csv.text()).toContain(addDays(usToday(), 29))
  })

  test("admin Activations show when each line ends", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/activations?q=646 555 0144")
    await expect(owner.getByRole("columnheader", { name: "Ends" })).toBeVisible()
    await expect(owner.getByText(shown(addDays(usToday(), 6))).first()).toBeVisible()
    await owner.screenshot({ path: `${SHOTS}/p3-admin-activations.png`, fullPage: true })
  })
})
