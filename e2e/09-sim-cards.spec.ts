import { expect, test, type Page } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, confirm, expectNoHorizontalScroll, expectToast, guestPage, orderButton, orderFor, pageAs, PHONE, signIn, submitAndPay } from "./support/helpers"

/**
 * SIM cards on their own (agreed 26 Oct): priced per carrier in admin, sold on the
 * website and to dealers with no plan and no length, shipped and done. Builds on the
 * E2E Mobile carrier and its "E2E Card" SIM card plan from 01-catalog.
 */

const CARD_BUYER = testEmail("card")
const CARD_PLAN_BUYER = testEmail("card-plan")
const DEALER = testEmail("card-dealer")
const COMPANY = "Card Wholesale Co"
const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"

async function carrierId() {
  const { data } = await db().from("carriers").select("id").eq("name", "E2E Mobile").single()
  return data!.id as string
}

async function fillContactAndAddress(page: Page, name: string, email: string) {
  await page.getByLabel("Full name").fill(name)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900123")
  await page.getByLabel("US ZIP code").fill("10001")
  await page.getByLabel("Street address").fill("350 Fifth Avenue")
  await page.getByLabel("City").fill("New York")
  await choose(page, page.locator("#state"), "New York")
  await page.locator("#ship_zip").fill("10118")
}

test.describe.serial("SIM cards on their own", () => {
  test("owner prices the E2E Mobile SIM card and puts it on sale", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/carriers")
    const row = owner.locator("form").filter({ hasText: "E2E Mobile SIM card" })
    await row.getByLabel("Price (USD)").fill("6.00")
    await row.getByLabel("Dealers (USD)").fill("4.50")
    await row.getByRole("switch", { name: "Sell the E2E Mobile SIM card on its own" }).click()
    await row.getByRole("button", { name: "Save" }).click()
    await expectToast(owner, "SIM card saved, on sale")
    await owner.screenshot({ path: `${SHOTS}/p2-admin-cards.png`, fullPage: true })

    const { data } = await db().from("sim_cards").select("price_cents, wholesale_price_cents, active").eq("carrier_id", await carrierId()).single()
    expect(data).toEqual({ price_cents: 600, wholesale_price_cents: 450, active: true })
  })

  test("the plans page shows the card with a price and no length", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto("/plans?carrier=e2e-mobile")
    const card = page.locator("article").filter({ hasText: "E2E Mobile SIM card" })
    await expect(card).toBeVisible()
    await expect(card.getByText("$6.00")).toBeVisible()
    await expect(card.getByText(/\bdays?\b/)).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/p2-plans-phone.png`, fullPage: true })

    // eSIM only: no cards.
    await page.goto("/plans?carrier=e2e-mobile&type=esim")
    await expect(page.locator("article").filter({ hasText: "E2E Mobile SIM card" })).toHaveCount(0)
  })

  test("customer buys SIM cards only: below the minimum is blocked, then the order has no plan or days", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto("/plans?carrier=e2e-mobile")
    await page.locator("article").filter({ hasText: "E2E Mobile SIM card" }).getByRole("link").click()
    await page.waitForURL(/\/checkout\?card=e2e-mobile/)

    const summary = page.getByRole("complementary", { name: "Your order" })
    await expect(summary.getByText("E2E Mobile SIM card").first()).toBeVisible()
    await expect(summary.locator("#plan-choice")).toContainText("No plan, SIM card only")
    await expect(page.locator("#days-choice")).toHaveCount(0)
    await expect(page.getByRole("switch")).toHaveCount(0)
    await expect(page.getByText("Plan start")).toHaveCount(0)

    // One card: 6.00 + shipping + network fee is under the minimum.
    const { data: settings } = await db().from("settings").select("shipping_fee_cents, network_fee_cents, min_order_cents").single()
    const one = 600 + settings!.shipping_fee_cents + settings!.network_fee_cents
    if (one < settings!.min_order_cents) {
      await expect(page.getByText(/Minimum order is/).filter({ visible: true }).first()).toBeVisible()
      await expect(orderButton(page, "Place order")).toBeDisabled()
    }
    await page.getByRole("button", { name: "One more" }).filter({ visible: true }).first().click()
    await page.getByRole("button", { name: "One more" }).filter({ visible: true }).first().click()
    await expect(summary.getByText("E2E Mobile SIM card x 3")).toBeVisible()
    await expect(summary.getByText("$18.00")).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/p2-checkout-card-phone.png`, fullPage: true })

    await fillContactAndAddress(page, "Noor Haddad", CARD_BUYER)
    await submitAndPay(page, "Place order", CARD_BUYER)
    await expect(page.getByText("3 x SIM card")).toBeVisible()
    await expect(page.locator("main").getByText(/\b\d+ days?\b/).filter({ visible: true })).toHaveCount(0)

    const order = await orderFor(CARD_BUYER)
    const { data: row } = await db().from("orders").select("kind, plan_id, days, plan_name, product_type, sim_card_price_cents, unit_price_cents, total_cents, status").eq("id", order.id).single()
    expect(row).toMatchObject({ kind: "card_only", plan_id: null, days: null, plan_name: null, product_type: "physical", sim_card_price_cents: 600, unit_price_cents: 0, status: "queued" })
    expect(row!.total_cents).toBe(3 * 600 + settings!.shipping_fee_cents + settings!.network_fee_cents)
  })

  test("in the same checkout a SIM card plan can be picked; the card costs the carrier's price", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto("/checkout?card=e2e-mobile")
    await choose(page, page.locator("#plan-choice"), "E2E Card")
    await expect(page.locator("#days-choice")).toContainText("7 days")
    const summary = page.getByRole("complementary", { name: "Your order" })
    await expect(summary.getByText("E2E Mobile E2E Card, 7 days x 1")).toBeVisible()
    await expect(summary.getByText("SIM card x 1")).toBeVisible()
    await expect(page.getByText("When should your plan start?")).toBeVisible()
    // Back to no plan: the plan lines go away again.
    await choose(page, page.locator("#plan-choice"), "No plan, SIM card only")
    await expect(summary.getByText("E2E Mobile SIM card x 1")).toBeVisible()
    await expect(page.getByText("When should your plan start?")).toHaveCount(0)
    await choose(page, page.locator("#plan-choice"), "E2E Card")

    await fillContactAndAddress(page, "Omar Said", CARD_PLAN_BUYER)
    await submitAndPay(page, "Place order", CARD_PLAN_BUYER)
    const order = await orderFor(CARD_PLAN_BUYER)
    const { data: row } = await db().from("orders").select("kind, days, sim_card_price_cents, plan_start").eq("id", order.id).single()
    expect(row).toMatchObject({ kind: "line", days: 7, sim_card_price_cents: 600, plan_start: "on_receipt" })
  })

  test("agent ships the cards; the customer sees Shipped with nothing to activate", async ({ browser }) => {
    const order = await orderFor(CARD_BUYER)
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await expect(agent.getByText("No plan, SIM card only")).toBeVisible()
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await agent.locator("#tracking").fill("9400111899223344559999")
    await agent.getByRole("button", { name: "Save for all SIMs" }).click()
    await expectToast(agent, "Tracking number saved")
    await agent.getByLabel("ICCIDs").fill("8901410000000000301\n8901410000000000302\n8901410000000000303")
    await agent.getByRole("button", { name: "Save details" }).click()
    await expectToast(agent, "Saved details for 3 SIMs")
    await agent.reload()
    await agent.getByRole("button", { name: "Mark shipped" }).filter({ visible: true }).first().click()
    await expect(agent.getByRole("alertdialog").getByText("These cards have no plan, so the order is done once shipped.")).toBeVisible()
    await confirm(agent, "Mark shipped")
    await expectToast(agent, "Marked shipped")

    const { data: row } = await db().from("orders").select("status, phase").eq("id", order.id).single()
    expect(row).toEqual({ status: "fulfilled", phase: "fulfil" })

    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByText("Shipped").first()).toBeVisible()
    await expect(customer.getByText("9400111899223344559999").first()).toBeVisible()
    await expect(customer.getByText("Got your SIM?")).toHaveCount(0)
    await expect(customer.locator("main").getByText(/\b\d+ days?\b/).filter({ visible: true })).toHaveCount(0)
    await customer.screenshot({ path: `${SHOTS}/p2-card-shipped-phone.png`, fullPage: true })

    // Not a line yet: not in Activations.
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/activations?q=8901410000000000301")
    await expect(owner.getByText("8901410000000000301")).toHaveCount(0)
  })

  test("dealer with no SIM card prices sees the note", async ({ browser }) => {
    const { data: profile } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    await db().from("profiles").insert({ id: profile.user!.id, role: "dealer", email: DEALER, full_name: "Card Buyer", active: true })
    await db().from("dealers").insert({ profile_id: profile.user!.id, company: COMPANY })
    await db().from("wallet_ledger").insert({ dealer_id: profile.user!.id, kind: "manual_add", amount_cents: 500_000, note: "E2E funds" })

    // Take every card off dealer pricing for a moment.
    const { data: before } = await db().from("sim_cards").select("carrier_id, wholesale_price_cents")
    await db().from("sim_cards").update({ wholesale_price_cents: null }).not("carrier_id", "is", null)
    try {
      const page = await signIn(browser, DEALER)
      await page.goto("/dealer/new")
      await expect(page.getByText("No SIM card prices set for your account yet. Contact us.")).toBeVisible()
    } finally {
      for (const r of before ?? []) await db().from("sim_cards").update({ wholesale_price_cents: r.wholesale_price_cents }).eq("carrier_id", r.carrier_id)
    }
  })

  test("dealer orders 500 SIM cards in one line: held, taken as they ship", async ({ browser }) => {
    const page = await signIn(browser, DEALER, PHONE)
    await page.goto("/dealer/new")
    await expect(page.getByText("No SIM card prices set for your account yet.")).toHaveCount(0)
    await choose(page, page.locator('[id^="plan-"]').first(), /E2E Mobile SIM card/)
    await expect(page.getByText("No plan, card only")).toBeVisible()
    await page.getByLabel("Quantity").first().fill("500")
    await page.getByLabel("Quantity").first().blur()
    await expect(page.getByText("E2E Mobile SIM card x 500")).toBeVisible()
    await page.getByLabel("Street address").fill("1 Market Street")
    await page.getByLabel("City").fill("San Francisco")
    await choose(page, page.locator("#state"), "California")
    await page.getByLabel("ZIP code").fill("94105")
    await page.getByLabel(/Reference/).fill("PO CARDS-500")
    await page.screenshot({ path: `${SHOTS}/p2-dealer-builder-phone.png`, fullPage: true })
    await page.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await page.waitForURL(/\/dealer\/orders\/[0-9a-f-]{36}/)
    await expect(page.getByText("SIM card only").first()).toBeVisible()
    await expect(page.getByText(/0\s+of\s+500\s+shipped/)).toBeVisible()

    const { data: settings } = await db().from("settings").select("shipping_fee_cents").single()
    const { data: batch } = await db().from("order_batches").select("id, total_cents").eq("reference", "PO CARDS-500").single()
    expect(batch!.total_cents).toBe(500 * 450 + settings!.shipping_fee_cents)
    const { data: line } = await db().from("orders").select("id, kind, days, quantity").eq("batch_id", batch!.id).single()
    expect(line).toMatchObject({ kind: "card_only", days: null, quantity: 500 })

    // The agent posts them (details filled in bulk here), then marks them shipped.
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${line!.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    const { data: items } = await db().from("order_items").select("id, seq").eq("order_id", line!.id)
    for (const item of items ?? []) {
      await db().from("order_items").update({ iccid: `8901410000000${String(100000 + item.seq)}`, tracking_number: "9400111899223344558888" }).eq("id", item.id)
    }
    await agent.reload()
    await agent.getByRole("button", { name: "Mark shipped" }).filter({ visible: true }).first().click()
    await confirm(agent, "Mark shipped")
    await expectToast(agent, "Marked shipped")

    const { data: wallet } = await db().rpc("dealer_wallet", { p_dealer_id: (await db().from("dealers").select("profile_id").eq("company", COMPANY).single()).data!.profile_id })
    expect(Number(wallet[0].reserved_cents)).toBe(0)
    expect(Number(wallet[0].balance_cents)).toBe(500_000 - batch!.total_cents)

    await page.reload()
    await expect(page.getByText(/500\s+of\s+500\s+shipped/)).toBeVisible()
  })

  test("a cancelled card-only dealer order gives the hold back", async ({ browser }) => {
    const page = await signIn(browser, DEALER)
    await page.goto("/dealer/new")
    await choose(page, page.locator('[id^="plan-"]').first(), /E2E Mobile SIM card/)
    await page.getByLabel("Quantity").first().fill("20")
    await page.getByLabel("Quantity").first().blur()
    await page.getByLabel("Street address").fill("1 Market Street")
    await page.getByLabel("City").fill("San Francisco")
    await choose(page, page.locator("#state"), "California")
    await page.getByLabel("ZIP code").fill("94105")
    await page.getByLabel(/Reference/).fill("PO CARDS-CANCEL")
    await page.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await page.waitForURL(/\/dealer\/orders\/[0-9a-f-]{36}/)

    const { data: batch } = await db().from("order_batches").select("id, dealer_id").eq("reference", "PO CARDS-CANCEL").single()
    const { data: line } = await db().from("orders").select("id").eq("batch_id", batch!.id).single()
    const before = (await db().rpc("dealer_wallet", { p_dealer_id: batch!.dealer_id })).data[0]
    expect(Number(before.reserved_cents)).toBeGreaterThan(0)

    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${line!.id}`)
    await owner.getByRole("button", { name: /Cancel order/ }).first().click()
    await owner.getByRole("dialog").getByRole("textbox").fill("Dealer asked to cancel")
    await owner.getByRole("dialog").getByRole("button", { name: /Cancel order/ }).click()
    await expectToast(owner, /cancel/i)
    await expect.poll(async () => Number((await db().rpc("dealer_wallet", { p_dealer_id: batch!.dealer_id })).data[0].reserved_cents)).toBe(0)
  })

  test("a dealer's own card price wins over the default", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/dealers")
    await owner.getByRole("link", { name: COMPANY }).click()
    await owner.getByRole("button", { name: /SIM cards/ }).click()
    await owner.getByLabel("E2E Mobile SIM card").fill("3.75")
    await owner.getByRole("button", { name: "Save prices" }).click()
    await expectToast(owner, "Saved 1 special price")

    const page = await signIn(browser, DEALER)
    await page.goto("/dealer/new")
    await page.locator('[id^="plan-"]').first().click()
    await expect(page.getByRole("option", { name: /E2E Mobile SIM card\s*\$3\.75/ })).toBeVisible()
  })
})
