import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, guestPage, orderButton, PHONE, signIn } from "./support/helpers"

/**
 * What the full manual QA pass of 28 Oct turned up, kept fixed. Builds on E2E Mobile and its
 * plans (01-catalog) and on E2E Unlimited and E2E Card being offered for refills (10-refill).
 */

const DEALER = testEmail("qa-dealer")
const COMPANY = "QA Regression Wireless"
const OTHER_CARRIER = "E2E Other Mobile"

async function carrier(name: string) {
  return (await db().from("carriers").select("id").eq("name", name).single()).data!.id as string
}

async function makeDealer() {
  const { data: profile } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
  const id = profile.user!.id
  await db().from("profiles").insert({ id, role: "dealer", email: DEALER, full_name: "QA Regression", active: true })
  await db().from("dealers").insert({ profile_id: id, company: COMPANY })
  await db().from("wallet_ledger").insert({ dealer_id: id, kind: "manual_add", amount_cents: 100_000, note: "E2E funds" })
  return id
}

test.describe.serial("QA fixes", () => {
  test("a dealer refill catches the same number typed twice, and the server refuses it too", async ({ browser }) => {
    await makeDealer()
    const page = await signIn(browser, DEALER, PHONE)
    await page.goto("/dealer/refill")
    await choose(page, page.locator('[id^="plan-"]').nth(0), /E2E Unlimited/)
    await choose(page, page.locator('[id^="days-"]').nth(0), /^30 days/)
    // The same number three ways, then a good one with a short ICCID.
    await page.locator('[id^="numbers-"]').nth(0).fill("3055550190\n(305) 555-0190\n+1 305 555 0190\n2125550100, 89012600001")
    await expect(page.getByText(/Rows 2 and 3 repeat numbers already in this refill/)).toBeVisible()
    await expect(page.getByText(/Row 4 has an ICCID that is not 18 to 22 digits/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Place refill" }).filter({ visible: true }).first()).toBeDisabled()
    // Several numbers on one row are read as separate numbers.
    await page.locator('[id^="numbers-"]').nth(0).fill("2125550101, 2125550102, 2125550103")
    await expect(page.getByText(/3 numbers/).first()).toBeVisible()
  })

  test("a refill matches a line only on the same carrier", async () => {
    // Another carrier's line with a number our refill customer types for E2E Mobile.
    const { data: other } = await db().from("carriers").insert({ name: OTHER_CARRIER, slug: "e2e-other-mobile", active: false }).select("id").single()
    const { data: order } = await db()
      .from("orders")
      .insert({
        channel: "website",
        kind: "line",
        customer_name: "Someone Else",
        customer_email: testEmail("qa-other-line"),
        customer_phone: "+44 7700 900999",
        carrier_id: other!.id,
        carrier_name: OTHER_CARRIER,
        plan_name: "Other Plan",
        days: 30,
        product_type: "esim",
        quantity: 1,
        unit_price_cents: 1000,
        total_cents: 1300,
        status: "fulfilled",
        paid_at: new Date().toISOString(),
        fulfilled_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    const { data: item } = await db()
      .from("order_items")
      .insert({ order_id: order!.id, seq: 1, status: "fulfilled", phone_number: "+1 (786) 555-0144", plan_starts_on: "2026-10-01", plan_ends_on: "2026-12-31" })
      .select("id")
      .single()

    const e2eMobile = await carrier("E2E Mobile")
    const { data: wrongCarrier } = await db().rpc("match_line", { p_phone: "786 555 0144", p_iccid: null, p_carrier_id: e2eMobile })
    expect(wrongCarrier).toBeNull()
    const { data: sameCarrier } = await db().rpc("match_line", { p_phone: "786 555 0144", p_iccid: null, p_carrier_id: other!.id })
    expect(sameCarrier).toBe(item!.id)
    // A phone match does not count when the ICCIDs disagree.
    await db().from("order_items").update({ iccid: "8901260000000000144" }).eq("id", item!.id)
    const { data: otherSim } = await db().rpc("match_line", { p_phone: "786 555 0144", p_iccid: "8901260000000099999", p_carrier_id: other!.id })
    expect(otherSim).toBeNull()

    await db().from("orders").delete().eq("id", order!.id)
    await db().from("carriers").delete().eq("id", other!.id)
  })

  test("the dealer's wallet never shows the owner's internal cancel reason", async () => {
    const { data: dealer } = await db().from("profiles").select("id").eq("email", DEALER).single()
    const { data: plan } = await db().from("plans").select("id, packages:day_packages(id, days)").eq("name", "E2E Unlimited").single()
    const pkg = (plan!.packages as { id: string; days: number }[]).find((p) => p.days === 30)!
    // An order held on the wallet, then cancelled with a reason the dealer must not see.
    const { data: order } = await db()
      .from("orders")
      .insert({
        channel: "dealer",
        kind: "line",
        customer_name: COMPANY,
        customer_email: DEALER,
        customer_phone: "-",
        carrier_id: await carrier("E2E Mobile"),
        carrier_name: "E2E Mobile",
        plan_id: plan!.id,
        day_package_id: pkg.id,
        plan_name: "E2E Unlimited",
        days: 30,
        product_type: "esim",
        quantity: 1,
        unit_price_cents: 1000,
        total_cents: 1000,
        status: "queued",
        paid_at: new Date().toISOString(),
        dealer_id: dealer!.id,
      })
      .select("id, number")
      .single()
    await db().from("wallet_ledger").insert({ dealer_id: dealer!.id, kind: "reserve", amount_cents: 1000, order_id: order!.id, note: "E2E hold" })
    await db().from("orders").update({ status: "cancelled", cancel_reason: "Internal: dealer owes us money", cancelled_at: new Date().toISOString() }).eq("id", order!.id)
    const { data: release } = await db().from("wallet_ledger").select("note").eq("order_id", order!.id).eq("kind", "release").single()
    expect(release!.note).toBe(`MS-${order!.number} cancelled`)
  })

  test("Customers counts only what was paid", async () => {
    const email = testEmail("qa-unpaid")
    await db().from("orders").insert({
      channel: "website",
      kind: "card_only",
      customer_name: "Unpaid Person",
      customer_email: email,
      customer_phone: "+44 7700 900111",
      shipping_address: { line1: "1 Test St", city: "New York", state: "NY", zip: "10001" },
      carrier_id: await carrier("E2E Mobile"),
      carrier_name: "E2E Mobile",
      product_type: "physical",
      quantity: 2,
      unit_price_cents: 0,
      sim_card_price_cents: 600,
      total_cents: 1600,
      status: "awaiting_payment",
    })
    const { data } = await db().from("customer_contacts").select("orders, spent_cents").eq("email", email).single()
    expect(data).toEqual({ orders: 0, spent_cents: 0 })
  })

  test("a SIM card on its own asks for no ZIP; activating a card offers only SIM card plans", async ({ browser }) => {
    // On sale on its own (09-sim-cards does this too; set here so this file runs alone).
    await db().from("sim_cards").upsert({ carrier_id: await carrier("E2E Mobile"), price_cents: 600, wholesale_price_cents: 450, active: true })
    const page = await guestPage(browser, PHONE)
    await page.goto("/checkout?card=e2e-mobile")
    await expect(page.getByLabel("US ZIP code")).toHaveCount(0)
    await expect(orderButton(page, "Place order")).toBeVisible()

    await page.goto("/refill?mode=activate")
    await choose(page, page.locator("#carrier-choice"), "E2E Mobile")
    await page.locator("#plan-choice").click()
    await expect(page.getByRole("option", { name: "E2E Card" })).toBeVisible()
    await expect(page.getByRole("option", { name: "E2E Unlimited" })).toHaveCount(0)
    await page.keyboard.press("Escape")

    // An unknown carrier in the plans address is ignored, not shown as a filter.
    await page.goto("/plans?carrier=nope")
    await expect(page.getByText("nope")).toHaveCount(0)
  })
})
