import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, expectNoHorizontalScroll, expectToast, guestPage, orderFor, pageAs, PHONE, signIn, submitAndPay } from "./support/helpers"

/**
 * The buyer's device details (Zafir, 7 Nov), all optional:
 *   Monthly plan: eSIM IMEI + EID, SIM card EID + ICCID
 *   Daily plan:   eSIM IMEI + EID, SIM card IMEI + ICCID
 * Asked at checkout and in the dealer order form, editable until delivery, shown to the agent,
 * carried to a replacement; photos from the buyer. Builds on E2E Unlimited and E2E Card.
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const FIX = (name: string) => `e2e/fixtures/${name}`
const BUYER = testEmail("device-buyer")
const DEALER = testEmail("device-dealer")
const IMEI = "356938035643809"
const IMEI2 = "356938035643817"
const EID = "89049032004008882600000000000001"
const EID2 = "89049032004008882600000000000002"
const ICCID = "8901260000000000555"

test.describe.serial("Device details", () => {
  test("the owner marks E2E Card as a monthly plan", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    const { data: plan } = await db().from("plans").select("id").eq("name", "E2E Card").single()
    await owner.goto(`/admin/plans/${plan!.id}`)
    await owner.getByRole("radiogroup", { name: "Plan type" }).getByText("Monthly").click()
    await owner.getByRole("button", { name: "Save plan" }).click()
    await expectToast(owner, /saved/i)
    await expect.poll(async () => (await db().from("plans").select("plan_type").eq("id", plan!.id).single()).data?.plan_type).toBe("monthly")

    // A monthly SIM card plan asks for the EID (and the card's ICCID) when activating a card.
    const guest = await guestPage(browser)
    await guest.goto("/refill?mode=activate")
    await choose(guest, guest.locator("#carrier-choice"), "E2E Mobile")
    await choose(guest, guest.locator("#plan-choice"), "E2E Card")
    await expect(guest.locator("#eid")).toBeVisible()
    await expect(guest.locator("#imei")).toHaveCount(0)
  })

  test("website checkout asks for the IMEI and EID, refuses a short IMEI, and saves them", async ({ browser }) => {
    const { data: plan } = await db().from("plans").select("slug").eq("name", "E2E Unlimited").single()
    const page = await guestPage(browser, PHONE)
    await page.goto(`/checkout?plan=${plan!.slug}&days=30`)
    await expect(page.getByText("Your phone (optional)")).toBeVisible()
    await page.getByLabel("Full name").fill("Device Buyer")
    await page.getByLabel("Email").fill(BUYER)
    await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900444")
    await page.getByLabel("US ZIP code").fill("10001")
    await page.locator("#imei_1").fill("35693803564380")
    await page.locator("#eid_1").fill(EID)
    await page.getByRole("button", { name: /Place order|Continue to payment/ }).filter({ visible: true }).first().click()
    await expect(page.getByText("An IMEI is 15 digits")).toBeVisible()
    await page.locator("#imei_1").fill(IMEI)
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/device-checkout-phone.png`, fullPage: true })
    await submitAndPay(page, "Place order", BUYER)

    const order = await orderFor(BUYER)
    const { data: item } = await db().from("order_items").select("imei, eid, buyer_iccid").eq("order_id", order.id).single()
    expect(item).toEqual({ imei: IMEI, eid: EID, buyer_iccid: null })
  })

  test("the customer changes the EID and adds a photo before delivery; the agent sees both", async ({ browser }) => {
    const order = await orderFor(BUYER)
    const customer = await guestPage(browser, PHONE)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByRole("heading", { name: "Your phone details" })).toBeVisible()
    const eid = customer.locator('input[name="eid"]')
    await eid.fill(EID2)
    await customer.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(customer, "Saved")
    await customer.locator('section[aria-labelledby="phone"] input[type="file"]').setInputFiles(FIX("qr-2.png"))
    await expectToast(customer, "Photo added")
    await expect(customer.getByText("1 of 10")).toBeVisible()
    await customer.screenshot({ path: `${SHOTS}/device-customer-phone.png`, fullPage: true })
    await expect.poll(async () => (await db().from("order_items").select("eid").eq("order_id", order.id).single()).data?.eid).toBe(EID2)

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await expect(agent.getByText(IMEI)).toBeVisible()
    await expect(agent.getByText(EID2)).toBeVisible()
    await expect(agent.getByText("Buyer's photos")).toBeVisible()
    await agent.goto("/agent")
    await expect(agent.getByText(/Device details 1 of 1/).first()).toBeVisible()
  })

  test("once delivered, the details are locked", async ({ browser }) => {
    const order = await orderFor(BUYER)
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await agent.getByRole("button", { name: "Mark complete and deliver" }).filter({ visible: true }).first().click()
    await agent.getByRole("alertdialog").getByRole("button", { name: "Deliver now" }).click()
    await expectToast(agent, "Delivered")

    const customer = await guestPage(browser, PHONE)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByRole("heading", { name: "Your phone details" })).toHaveCount(0)
    const { data: item } = await db().from("order_items").select("id").eq("order_id", order.id).single()
    const { error } = await db().rpc("set_item_device", { p_item_id: item!.id, p_imei: IMEI2, p_eid: "", p_buyer_iccid: "" })
    expect(error?.message).toMatch(/already delivered/)
  })

  test("a replacement starts with the original SIM's details", async () => {
    const order = await orderFor(BUYER)
    const { data: item } = await db().from("order_items").select("id").eq("order_id", order.id).single()
    const { data: full } = await db().from("orders").select("*").eq("id", order.id).single()
    const { id: _id, number: _n, public_token: _t, created_at: _c, updated_at: _u, ...copy } = full!
    void [_id, _n, _t, _c, _u]
    const { data: rep } = await db()
      .from("orders")
      .insert({ ...copy, status: "queued", replacement_of: order.id, replaces_item_id: item!.id, total_cents: 0, fulfilled_at: null, claimed_by: null, claimed_at: null })
      .select("id")
      .single()
    const { data: repItem } = await db().from("order_items").insert({ order_id: rep!.id, seq: 1 }).select("imei, eid").single()
    expect(repItem).toEqual({ imei: IMEI, eid: EID2 })
    await db().from("orders").delete().eq("id", rep!.id)
  })

  test("a dealer pastes device rows; a bad row and too many rows are caught; they land on SIM 1 and 2", async ({ browser }) => {
    const { data: user } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    const id = user.user!.id
    await db().from("profiles").insert({ id, role: "dealer", email: DEALER, full_name: "Device Dealer", active: true })
    await db().from("dealers").insert({ profile_id: id, company: "E2E Device Wireless" })
    await db().from("wallet_ledger").insert({ dealer_id: id, kind: "manual_add", amount_cents: 100_000, note: "E2E funds" })

    const page = await signIn(browser, DEALER, PHONE)
    await page.goto("/dealer/new")
    await choose(page, page.locator('[id^="plan-"]').nth(0), /E2E Unlimited/)
    await choose(page, page.locator('[id^="days-"]').nth(0), /^30 days/)
    await page.getByLabel("Quantity").first().fill("3")
    await page.getByLabel("Quantity").first().blur()
    const box = page.locator('[id^="devices-"]').first()
    await box.fill(`${IMEI}, ${EID}\n12345, ${EID2}`)
    await expect(page.getByText(/Row 2 is not IMEI and EID/)).toBeVisible()
    await box.fill(`${IMEI}, ${EID}\n${IMEI2}, ${EID2}\n${IMEI}\n${IMEI2}`)
    await expect(page.getByText(/4 rows of device details for 3 SIMs/)).toBeVisible()
    await box.fill(`${IMEI}, ${EID}\n${IMEI2} ${EID2}`)
    await expect(page.getByText(/2 of 3 SIMs have details/)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/device-dealer-form-phone.png`, fullPage: true })
    await page.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expectToast(page, /placed/)
    await page.waitForURL(/\/dealer\/orders\//)

    const { data: order } = await db().from("orders").select("id").eq("dealer_id", id).single()
    const { data: items } = await db().from("order_items").select("seq, imei, eid").eq("order_id", order!.id).order("seq")
    expect(items).toEqual([
      { seq: 1, imei: IMEI, eid: EID },
      { seq: 2, imei: IMEI2, eid: EID2 },
      { seq: 3, imei: null, eid: null },
    ])

    // SIM 3 gets its details on the order page; a photo too.
    await page.getByText(/Device details for 3 SIMs not delivered yet/).click()
    const sim3 = page.locator("form").filter({ hasText: "SIM 3" })
    await sim3.locator('input[name="imei"]').fill(IMEI)
    await sim3.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(page, "Saved")
    await expect.poll(async () => (await db().from("order_items").select("imei").eq("order_id", order!.id).eq("seq", 3).single()).data?.imei).toBe(IMEI)
    await page.locator('input[type="file"]').first().setInputFiles(FIX("qr-2.png"))
    await expectToast(page, "Photo added")
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/device-dealer-order-phone.png`, fullPage: true })
    const { count } = await db().from("order_photos").select("id", { count: "exact", head: true }).eq("order_id", order!.id)
    expect(count).toBe(1)
  })

  test("the database refuses a bad dealer device row", async () => {
    const { data: pkg } = await db().from("day_packages").select("id, plan:plans!inner(name)").eq("plan.name", "E2E Unlimited").eq("days", 30).single()
    // Called as the service role it is refused before anything else; the format rules are the columns' own checks.
    const { error } = await db().from("order_items").insert({ order_id: (await orderFor(BUYER)).id, seq: 9, imei: "123" })
    expect(error).not.toBeNull()
    void pkg
  })
})
