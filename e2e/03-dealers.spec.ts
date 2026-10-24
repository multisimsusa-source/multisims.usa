import { expect, test, type Page } from "@playwright/test"

import { db } from "./support/db"
import { DEALER_A, DEALER_B, PASSWORD } from "./support/env"
import { BASE_URL } from "./support/env"
import { choose, confirm, DESKTOP, expectNoHorizontalScroll, expectToast, guestPage, pageAs, PHONE, signIn } from "./support/helpers"

/**
 * Milestone 3 demo checklist: two dealers, one funded by hand and one by a crypto top-up,
 * a mixed bulk order followed to delivery, a physical bulk order with one tracking number,
 * a dealer ticket, a cancelled order returning its hold, and a suspended login.
 */

const FIX = (name: string) => `e2e/fixtures/${name}`
const A = "E2E Southern Cross"
const B = "E2E Pacific Lines"

async function dealerId(email: string) {
  const { data } = await db().from("profiles").select("id").eq("email", email).single()
  return data!.id as string
}

async function createDealer(owner: Page, name: string, email: string, company: string) {
  await owner.goto("/admin/dealers")
  await owner.getByRole("button", { name: "New dealer" }).first().click()
  const dialog = owner.getByRole("dialog")
  await dialog.getByLabel("Name", { exact: true }).fill(name)
  await dialog.getByLabel("Email").fill(email)
  await dialog.getByLabel("Company").fill(company)
  await dialog.getByLabel("Password").fill(PASSWORD)
  await dialog.getByRole("button", { name: "Create dealer" }).click()
  await expectToast(owner, `${company} can sign in now`)
}

/** The dealer's order line for a plan, as the agent opens it. */
async function lineOrder(company: string, planName: string, status?: string) {
  let query = db().from("orders").select("id, number, status").eq("customer_name", company).eq("plan_name", planName).is("replacement_of", null).order("created_at", { ascending: true })
  if (status) query = query.eq("status", status)
  const { data } = await query.limit(1).single()
  return data!
}

async function claim(agent: Page, orderId: string) {
  await agent.goto(`/agent/orders/${orderId}`)
  await agent.getByRole("button", { name: /^Claim/ }).first().click()
  await expectToast(agent, "Claimed")
}

async function finish(agent: Page, orderId: string, button: string, confirmLabel: string) {
  await agent.goto(`/agent/orders/${orderId}`)
  await agent.getByRole("button", { name: button }).filter({ visible: true }).first().click()
  await confirm(agent, confirmLabel)
}

test.describe.serial("Dealers", () => {
  test("owner creates two dealers, adds funds to one, sets a special price", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await createDealer(owner, "Liam Carter", DEALER_A, A)
    await createDealer(owner, "Mia Tan", DEALER_B, B)

    await owner.goto("/admin/dealers")
    await owner.getByRole("link", { name: A }).click()
    await owner.getByRole("button", { name: "Add funds" }).click()
    const dialog = owner.getByRole("dialog")
    await dialog.getByLabel("Amount (USD)").fill("500")
    await dialog.getByLabel("Note").fill("Paid on WhatsApp for the first batch")
    await dialog.getByRole("button", { name: "Add funds" }).click()
    await expectToast(owner, "Funds added: $500.00")
    await expect(owner.getByText("$500.00").first()).toBeVisible()

    // A correction can never take more than the dealer has.
    await owner.getByRole("button", { name: "Correction" }).click()
    const fix = owner.getByRole("dialog")
    await fix.locator("label").filter({ hasText: "Take from balance" }).click()
    await fix.getByLabel("Amount (USD)").fill("9999")
    await fix.getByLabel("Note").fill("Test of the limit")
    await fix.getByRole("button", { name: "Save correction" }).click()
    await expectToast(owner, /Only \$500\.00 is available/)
    await owner.keyboard.press("Escape")

    // Special price: 7 days of E2E Unlimited at 9.00 instead of the 10.00 wholesale price.
    await owner.reload()
    await owner.getByRole("button", { name: /E2E Mobile E2E Unlimited/ }).click()
    const prices = owner.locator('[data-slot="accordion-item"]').filter({ hasText: "E2E Mobile E2E Unlimited" })
    await prices.getByLabel("7 days").fill("9.00")
    await owner.getByRole("button", { name: "Save prices" }).click()
    await expectToast(owner, "Saved 1 special price")
  })

  test("a confirmed crypto top-up credits the other dealer once", async ({ browser }) => {
    // NOWPayments is switched off in tests: record the confirmed invoice and run the
    // same database step the webhook runs, twice, as a retried webhook would.
    const client = db()
    const id = await dealerId(DEALER_B)
    const { data: payment } = await client
      .from("payments")
      .insert({ kind: "wallet_topup", dealer_id: id, provider: "nowpayments", price_cents: 25000, status: "paid", pay_currency: "usdttrc20" })
      .select("id")
      .single()
    await client.rpc("credit_wallet_topup", { p_payment_id: payment!.id })
    await client.rpc("credit_wallet_topup", { p_payment_id: payment!.id })
    const { data: rows } = await client.from("wallet_ledger").select("kind").eq("payment_id", payment!.id)
    expect(rows).toHaveLength(1)

    const dealer = await signIn(browser, DEALER_B)
    await dealer.goto("/dealer/wallet")
    await expect(dealer.getByText("Crypto top-up").first()).toBeVisible()
    await expect(dealer.getByText("$250.00").first()).toBeVisible()
    // Without a payment provider the page says so instead of offering a form.
    await expect(dealer.getByText("Crypto top-up opens soon")).toBeVisible()
  })

  test("dealer places a mixed bulk order; too large an order is refused", async ({ browser }) => {
    const dealer = await signIn(browser, DEALER_A)
    await expect(dealer.getByText("$500.00").first()).toBeVisible()
    await dealer.goto("/dealer/new")

    const plans = dealer.locator('[id^="plan-"]')
    const days = dealer.locator('[id^="days-"]')
    await choose(dealer, plans.nth(0), /E2E Mobile E2E Unlimited \(eSIM\)/)
    await choose(dealer, days.nth(0), /^7 days/)
    await dealer.getByLabel("Quantity").nth(0).fill("3")
    await dealer.getByRole("switch").nth(0).click()

    // 500 SIMs is more than the balance: a warning, and Place order stays off.
    await dealer.getByLabel("Quantity").nth(0).fill("500")
    await dealer.getByLabel("Quantity").nth(0).blur()
    await expect(dealer.getByText(/You need \$[\d,.]+ more/).first()).toBeVisible()
    await expect(dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first()).toBeDisabled()
    await dealer.getByLabel("Quantity").nth(0).fill("3")
    await dealer.getByLabel("Quantity").nth(0).blur()

    await dealer.getByRole("button", { name: "Add line" }).click()
    await choose(dealer, plans.nth(1), /E2E Mobile E2E Card \(SIM card\)/)
    await choose(dealer, days.nth(1), /^7 days/)
    await dealer.getByLabel("Quantity").nth(1).fill("2")
    await dealer.getByLabel("Quantity").nth(1).blur()

    await dealer.getByLabel("Street address").fill("1 Market Street")
    await dealer.getByLabel("City").fill("San Francisco")
    await choose(dealer, dealer.locator("#state"), "California")
    await dealer.getByLabel("ZIP code").fill("94105")
    await dealer.getByLabel(/Reference/).fill("PO E2E-1")
    await dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await dealer.waitForURL(/\/dealer\/orders\/[0-9a-f-]{36}/)
    await expect(dealer.getByText("PO E2E-1")).toBeVisible()

    // eSIM line: 3 x (9.00 + 4.00 calling) = 39.00. Card line: 2 x (12.00 + 4.00 card) + shipping.
    const { data: batch } = await db().from("order_batches").select("id, total_cents").eq("reference", "PO E2E-1").single()
    const { data: settings } = await db().from("settings").select("shipping_fee_cents, dealer_sim_card_price_cents").single()
    expect(batch!.total_cents).toBe(3900 + 2 * (1200 + settings!.dealer_sim_card_price_cents) + settings!.shipping_fee_cents)

    // The whole order is held: available drops, balance does not.
    await dealer.goto("/dealer/wallet")
    await expect(dealer.getByText("Held for order").first()).toBeVisible()
  })

  test("agents fill the eSIM line with the bulk tools and post the SIM cards with one tracking number", async ({ browser }) => {
    const agent = await pageAs(browser, "agent")
    const esim = await lineOrder(A, "E2E Unlimited")
    await claim(agent, esim.id)
    await expect(agent.getByText(new RegExp(`Dealer order, B-\\d+ from ${A}`))).toBeVisible()
    await agent.locator('input[type="file"][multiple]').setInputFiles([FIX("qr-1.png"), FIX("qr-2.png"), FIX("qr-3.png")])
    await agent.getByRole("button", { name: "Upload 3 QR codes" }).click()
    await expect(agent.getByText(/Uploaded\s+3\s+of\s+3/)).toBeVisible()
    await agent.getByLabel("Phone numbers and ICCIDs").fill("+1 415 555 0301, 8901260000000000301\n+1 415 555 0302, 8901260000000000302\n+1 415 555 0303, 8901260000000000303")
    await agent.getByRole("button", { name: "Save details" }).click()
    await expectToast(agent, "Saved details for 3 SIMs")
    await finish(agent, esim.id, "Mark complete and deliver", "Deliver now")
    await expectToast(agent, "Delivered")

    const card = await lineOrder(A, "E2E Card")
    await claim(agent, card.id)
    await agent.getByLabel("Phone numbers and ICCIDs").fill("8901410000000000311\n8901410000000000312")
    await agent.getByRole("button", { name: "Save details" }).click()
    await expectToast(agent, "Saved details for 2 SIMs")
    await agent.locator("#tracking").fill("9400111899223344550311")
    await agent.getByRole("button", { name: "Save for all SIMs" }).click()
    await expectToast(agent, "Tracking number saved")
    await finish(agent, card.id, "Mark shipped", "Mark shipped")
    await expectToast(agent, "Marked shipped")
  })

  test("dealer sees the eSIMs, starts the SIM cards, and the lines go live", async ({ browser }) => {
    const { data: batch } = await db().from("order_batches").select("id, total_cents").eq("reference", "PO E2E-1").single()
    const dealer = await signIn(browser, DEALER_A, PHONE)
    await dealer.goto(`/dealer/orders/${batch!.id}`)
    await expect(dealer.getByText("3 of 3 live").filter({ visible: true })).toBeVisible()
    await expect(dealer.getByRole("link", { name: /QR code for SIM 1/ })).toBeVisible()
    await expect(dealer.getByText("9400111899223344550311").first()).toBeVisible()
    await expectNoHorizontalScroll(dealer)
    await dealer.getByRole("button", { name: "The cards arrived, activate them" }).click()
    await expectToast(dealer, "Your lines are starting up")

    const agent = await pageAs(browser, "agent")
    const card = await lineOrder(A, "E2E Card")
    await claim(agent, card.id)
    await agent.getByLabel("Phone numbers and ICCIDs").fill("+1 628 555 0311\n+1 628 555 0312")
    await agent.getByRole("button", { name: "Save details" }).click()
    await expectToast(agent, "Saved details for 2 SIMs")
    await finish(agent, card.id, "Mark active and deliver", "Deliver now")
    await expectToast(agent, "Line active")

    await dealer.reload()
    await expect(dealer.getByText("Delivered").first()).toBeVisible()
    await expect(dealer.getByText("5 of 5").filter({ visible: true })).toBeVisible()
    // Every SIM delivered: the whole order is taken from the wallet, nothing still held.
    const total = `$${(batch!.total_cents / 100).toFixed(2)}`
    await expect(dealer.getByText("Taken so far").locator("..")).toContainText(total)
    await expect(dealer.getByText("Still held").locator("..")).toContainText("$0.00")

    const csv = await dealer.request.get(`${BASE_URL}/dealer/orders/${batch!.id}/sims.csv`)
    expect(csv.status()).toBe(200)
    const text = await csv.text()
    expect(text).toContain("8901260000000000302")
    expect(text).toContain("8901410000000000312")

    await dealer.goto("/dealer/activations?q=8901410000000000312")
    await expect(dealer.getByText("1 line")).toBeVisible()

    await dealer.goto("/dealer/wallet")
    await expect(dealer.getByText("$500.00").first()).toBeVisible()
    const available = `$${((50000 - batch!.total_cents) / 100).toFixed(2)}`
    await expect(dealer.getByText(available).first()).toBeVisible()
  })

  test("dealer reports a problem on a line, the owner answers", async ({ browser }) => {
    const { data: batch } = await db().from("order_batches").select("id").eq("reference", "PO E2E-1").single()
    const dealer = await signIn(browser, DEALER_A)
    await dealer.goto(`/dealer/orders/${batch!.id}`)
    await dealer.getByRole("button", { name: "Report a problem" }).first().click()
    await choose(dealer, dealer.locator("#ticket-type"), "No signal")
    await choose(dealer, dealer.locator("#ticket-item"), /^SIM 2/)
    await dealer.getByLabel("Describe what happens").fill("Our customer in Sydney reports no signal on SIM 2 after installing it twice.")
    await dealer.getByRole("button", { name: "Send request" }).click()
    await expect(dealer.getByText(/Request #\d+ sent\./)).toBeVisible()

    const esim = await lineOrder(A, "E2E Unlimited")
    const { data: ticket } = await db().from("tickets").select("id").eq("order_id", esim.id).single()
    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/tickets/${ticket!.id}`)
    await owner.locator("label").filter({ hasText: /^Resolved$/ }).click()
    await owner.getByLabel("Answer to the customer").fill("Please switch roaming on for line 2 and restart.")
    await owner.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(owner, /./)

    await dealer.goto("/dealer/tickets")
    await expect(dealer.getByText("Please switch roaming on for line 2 and restart.")).toBeVisible()
    await expect(dealer.getByText("Resolved").first()).toBeVisible()
  })

  test("a cancelled dealer order returns its hold", async ({ browser }) => {
    const dealer = await signIn(browser, DEALER_A)
    await dealer.goto("/dealer/new")
    await choose(dealer, dealer.locator('[id^="plan-"]').first(), /E2E Mobile E2E Unlimited \(eSIM\)/)
    await choose(dealer, dealer.locator('[id^="days-"]').first(), /^7 days/)
    await dealer.getByLabel(/Reference/).fill("PO E2E-2")
    await dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await dealer.waitForURL(/\/dealer\/orders\/[0-9a-f-]{36}/)

    const { data: batch } = await db().from("order_batches").select("id").eq("reference", "PO E2E-2").single()
    const { data: order } = await db().from("orders").select("id").eq("batch_id", batch!.id).single()
    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${order!.id}`)
    await owner.getByRole("button", { name: "Cancel order" }).first().click()
    await owner.getByRole("dialog").getByLabel("Reason (internal)").fill("Dealer changed their mind")
    await owner.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click()
    await expectToast(owner, /cancel/i)

    await dealer.goto("/dealer/wallet")
    await expect(dealer.getByText("Hold returned").first()).toBeVisible()
    const id = await dealerId(DEALER_A)
    const { data: wallet } = await db().rpc("dealer_wallet", { p_dealer_id: id })
    expect(Number(wallet[0].reserved_cents)).toBe(0)
  })

  test("a suspended dealer cannot sign in", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/dealers")
    await owner.getByRole("link", { name: B }).click()
    await owner.getByRole("switch", { name: `${B} can sign in` }).click()
    await expectToast(owner, "Dealer suspended")

    const page = await guestPage(browser, DESKTOP)
    await page.goto("/portal/login")
    await page.fill('input[name="email"]', DEALER_B)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/portal\/login/)
    await expect(page.getByRole("alert").first()).toBeVisible()
  })

  test("dealer pages fit a phone", async ({ browser }) => {
    const dealer = await signIn(browser, DEALER_A, PHONE)
    for (const path of ["/dealer", "/dealer/new", "/dealer/orders", "/dealer/activations", "/dealer/tickets", "/dealer/wallet", "/dealer/account"]) {
      await dealer.goto(path)
      await expect(dealer.locator("main h1").first()).toBeVisible()
      await expectNoHorizontalScroll(dealer)
    }
  })
})
