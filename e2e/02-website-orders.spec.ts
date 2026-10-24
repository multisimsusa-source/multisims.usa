import { expect, test, type Page } from "@playwright/test"

import { db } from "./support/db"
import { REMOTE, testEmail } from "./support/env"
import { choose, confirm, expectNoHorizontalScroll, expectPaid, expectToast, guestPage, orderFor, pageAs, payInSandbox } from "./support/helpers"

/**
 * Milestone 2 and the M3 website additions, as a customer and the team see them:
 * checkout (sale price, discount code, calling), fulfilment with the bulk tools, delivery,
 * rating and featuring, a ticket leading to a replacement, a SIM card shipped and
 * activated, and an order cancelled and refunded by the owner.
 */

const ESIM_CUSTOMER = testEmail("esim")
const SIM_CUSTOMER = testEmail("sim")
const CANCEL_CUSTOMER = testEmail("cancel")
const FIX = (name: string) => `e2e/fixtures/${name}`

async function slugOf(name: string) {
  const { data } = await db().from("plans").select("slug").eq("name", name).single()
  return data!.slug as string
}

async function fillContact(page: Page, name: string, email: string) {
  await page.getByLabel("Full name").fill(name)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900123")
  await page.getByLabel("US ZIP code").fill("10001")
}

/**
 * Places the order and gets it paid. Locally there is no payment provider: the order page
 * opens with the order already in the queue. On the deployed site the buyer goes to the
 * provider's (sandbox) invoice; the test pays it there and waits for the webhook, then
 * opens the order page.
 */
async function placeOrder(page: Page, email: string) {
  const button = page.getByRole("button", { name: REMOTE ? "Continue to payment" : "Place order" }).filter({ visible: true }).first()
  await button.click()
  if (!REMOTE) {
    await page.waitForURL(/\/order\/[0-9a-f]{48}/)
    return
  }
  await page.waitForURL((url) => url.hostname.includes("nowpayments"), { timeout: 60_000 })
  const order = await orderFor(email)
  await payInSandbox({ orderId: order.id })
  await expectPaid(order.id)
  await page.goto(`/order/${order.public_token}?paid=1`)
}

async function deliver(agent: Page, orderId: string, finish: { button: string; confirm: string }) {
  await agent.goto(`/agent/orders/${orderId}`)
  await agent.getByRole("button", { name: finish.button }).filter({ visible: true }).first().click()
  await confirm(agent, finish.confirm)
}

test.describe.serial("Website orders", () => {
  test("owner creates a 10% discount code", async ({ browser }) => {
    const page = await pageAs(browser, "owner")
    await page.goto("/admin/discounts")
    await page.getByRole("button", { name: "New code" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Code").fill("e2eoff")
    await dialog.getByLabel("Percent off").fill("10")
    await dialog.getByRole("button", { name: "Create code" }).click()
    await expectToast(page, "E2EOFF is ready")
    await expect(page.locator("main ul").getByText("E2EOFF", { exact: true })).toBeVisible()
  })

  test("customer buys two eSIMs on sale, with calling and a discount code", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto(`/checkout?plan=${await slugOf("E2E Unlimited")}&days=30`)
    await page.getByRole("button", { name: "One more" }).click()
    await page.getByRole("switch", { name: /International calling/ }).click()

    // A bad code is refused in words; the real one comes off the plan, calling and SIMs only.
    await page.getByRole("button", { name: "Have a discount code?" }).first().click()
    await page.getByLabel("Discount code").first().fill("NOPE99")
    await page.getByRole("button", { name: "Apply" }).first().click()
    await expect(page.getByText("That code is not valid").first()).toBeVisible()
    await page.getByLabel("Discount code").first().fill("E2EOFF")
    await page.getByRole("button", { name: "Apply" }).first().click()
    await expect(page.getByText("Discount (E2EOFF)").first()).toBeVisible()

    await fillContact(page, "Ana Silva", ESIM_CUSTOMER)
    await expectNoHorizontalScroll(page)
    await placeOrder(page, ESIM_CUSTOMER)
    await expect(page.getByText("Order placed.")).toBeVisible()
    await expect(page.getByText("Processing").first()).toBeVisible()

    // (Sale price 28.00 + calling) x 2, 10% off that, plus the network fee. Never off the fee.
    const [{ data: addon }, { data: settings }] = await Promise.all([
      db().from("addons").select("price_cents").eq("code", "intl_calling").single(),
      db().from("settings").select("network_fee_cents").single(),
    ])
    const base = (2800 + addon!.price_cents) * 2
    const discount = Math.round(base * 0.1)
    const order = await orderFor(ESIM_CUSTOMER)
    expect(order.unit_price_cents).toBe(2800)
    expect(order.discount_cents).toBe(discount)
    expect(order.total_cents).toBe(base - discount + settings!.network_fee_cents)
    expect(order.status).toBe("queued")
    // A use is counted once the payment is confirmed.
    await expect.poll(async () => (await db().from("discount_codes").select("uses").eq("code", "E2EOFF").single()).data?.uses).toBe(1)
  })

  test("agent fills both eSIMs with the bulk tools and delivers", async ({ browser }) => {
    const order = await orderFor(ESIM_CUSTOMER)
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")

    // Files are matched in natural name order: qr-2 before qr-10.
    await agent.locator('input[type="file"][multiple]').setInputFiles([FIX("qr-10.png"), FIX("qr-2.png")])
    await expect(agent.locator('section[aria-labelledby="bulk-title"] ol li').first()).toContainText("qr-2.png")
    await agent.getByRole("button", { name: "Upload 2 QR codes" }).click()
    await expect(agent.getByText(/Uploaded\s+2\s+of\s+2/)).toBeVisible()

    await agent.getByLabel("Phone numbers and ICCIDs").fill("+1 212 555 0101, 8901260000000000101\n2125550102\t8901260000000000102")
    await agent.getByRole("button", { name: "Save details" }).click()
    await expectToast(agent, "Saved details for 2 SIMs")
    await agent.reload()

    await deliver(agent, order.id, { button: "Mark complete and deliver", confirm: "Deliver now" })
    await expectToast(agent, "Delivered")

    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByText("Delivered").first()).toBeVisible()
    await expect(customer.getByRole("img", { name: /eSIM QR code/ })).toHaveCount(2)
    await expect(customer.getByText("8901260000000000102")).toBeVisible()
    await expectNoHorizontalScroll(customer)
  })

  test("customer rates the order, owner features it, it shows on the home page", async ({ browser }) => {
    const order = await orderFor(ESIM_CUSTOMER)
    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await customer.getByRole("radio", { name: "5 stars, excellent" }).check({ force: true })
    await customer.getByLabel(/Anything to add/).fill("Both eSIMs worked as soon as we landed.")
    await customer.getByRole("button", { name: "Send rating" }).click()
    await expect(customer.getByText("Thanks for rating your order")).toBeVisible()

    // Nothing shows publicly until the owner features it.
    const visitor = await guestPage(browser)
    await visitor.goto("/")
    await expect(visitor.getByText("Both eSIMs worked as soon as we landed.")).toHaveCount(0)

    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/reviews")
    await owner.getByRole("switch", { name: "Feature Ana's review on the website" }).click()
    await expectToast(owner, "Featured on the website")

    await visitor.goto("/")
    await expect(visitor.getByRole("heading", { name: "Featured customer reviews" })).toBeVisible()
    await expect(visitor.getByText("Both eSIMs worked as soon as we landed.")).toBeVisible()
    // Never an average or a count.
    await expect(visitor.getByText(/average|out of 5 from/i)).toHaveCount(0)
  })

  test("customer reports a problem, the team answers and replaces the SIM", async ({ browser }) => {
    const order = await orderFor(ESIM_CUSTOMER)
    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await customer.getByRole("button", { name: "Report a problem" }).click()
    await choose(customer, customer.locator("#ticket-type"), "No signal")
    await choose(customer, customer.locator("#ticket-item"), /eSIM 2/)
    await customer.getByLabel("Describe what happens").fill("The second eSIM shows no signal in Manhattan. Roaming is on and the phone was restarted.")
    await customer.getByRole("button", { name: "Send request" }).click()
    await expect(customer.getByText(/Request #\d+ sent\./)).toBeVisible()

    const { data: ticket } = await db().from("tickets").select("id").eq("order_id", order.id).single()
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/tickets/${ticket!.id}`)
    await agent.locator("label").filter({ hasText: /^In progress$/ }).click()
    await agent.getByLabel("Answer to the customer").fill("We are sending you a new eSIM for line 2.")
    await agent.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, /./)
    await agent.getByRole("button", { name: "Replace" }).first().click()
    await confirm(agent, "Issue replacement")

    let replacement: { id: string } | null = null
    await expect
      .poll(async () => {
        replacement = (await db().from("orders").select("id").eq("replacement_of", order.id).maybeSingle()).data
        return replacement?.id
      })
      .toBeTruthy()
    await agent.goto(`/agent/orders/${replacement!.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await agent.locator('input[type="file"]').first().setInputFiles(FIX("qr-3.png"))
    await agent.getByRole("button", { name: "Save QR and details" }).click()
    await expectToast(agent, "QR code saved")
    await agent.reload()
    await deliver(agent, replacement!.id, { button: "Mark complete and deliver", confirm: "Deliver now" })
    await expectToast(agent, "Delivered")

    await customer.reload()
    await expect(customer.getByText("We are sending you a new eSIM for line 2.")).toBeVisible()
    await expect(customer.getByText("No longer valid")).toBeVisible()
    await expect(customer.getByRole("img", { name: /eSIM QR code/ })).toHaveCount(2)
  })

  test("SIM card: posted with tracking, the customer activates it, the line goes live", async ({ browser }) => {
    const page = await guestPage(browser)
    await page.goto(`/checkout?plan=${await slugOf("E2E Card")}&days=7`)
    await fillContact(page, "Ben Carter", SIM_CUSTOMER)
    await page.getByLabel("Street address").fill("350 Fifth Avenue")
    await page.getByLabel("City").fill("New York")
    await choose(page, page.locator("#state"), "New York")
    await page.locator("#ship_zip").fill("10118")
    await placeOrder(page, SIM_CUSTOMER)
    const order = await orderFor(SIM_CUSTOMER)
    // 14.00 + SIM card 5.00 + shipping + network fee: stored line by line.
    expect(order.total_cents).toBeGreaterThan(1900)

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await agent.getByLabel("ICCID").fill("8901410000000000201")
    await agent.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await agent.locator("#tracking").fill("9400111899223344550001")
    await agent.getByRole("button", { name: "Save for all SIMs" }).click()
    await expectToast(agent, "Tracking number saved")
    await deliver(agent, order.id, { button: "Mark shipped", confirm: "Mark shipped" })
    await expectToast(agent, "Marked shipped")

    await page.reload()
    await expect(page.getByText("Shipped").first()).toBeVisible()
    await expect(page.getByText("9400111899223344550001")).toBeVisible()
    await page.getByRole("button", { name: "My SIM has arrived, activate it" }).click()
    await expect(page.getByText("Your line is starting up").first()).toBeVisible()

    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await agent.getByLabel("Phone number").fill("+1 646 555 0201")
    await agent.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await deliver(agent, order.id, { button: "Mark active and deliver", confirm: "Deliver now" })
    await expectToast(agent, "Line active")

    await page.reload()
    await expect(page.getByText("Delivered").first()).toBeVisible()
    await expect(page.getByText("+1 646 555 0201")).toBeVisible()
  })

  test("owner cancels an order and records the refund; the customer sees it", async ({ browser }) => {
    const page = await guestPage(browser)
    // 30 days, so the total is above any payment provider minimum.
    await page.goto(`/checkout?plan=${await slugOf("E2E Unlimited")}&days=30`)
    await fillContact(page, "Chen Wei", CANCEL_CUSTOMER)
    await placeOrder(page, CANCEL_CUSTOMER)
    const order = await orderFor(CANCEL_CUSTOMER)

    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${order.id}`)
    await owner.getByRole("button", { name: "Cancel order" }).first().click()
    await owner.getByRole("dialog").getByLabel("Reason (internal)").fill("Customer asked to cancel")
    await owner.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click()
    await expectToast(owner, /cancel/i)
    await owner.getByRole("button", { name: "Record refund" }).click()
    await owner.getByRole("dialog").getByLabel("Refund details").fill("Sent 15.00 USDT back")
    await owner.getByRole("dialog").getByRole("button", { name: "Record refund" }).click()
    await expectToast(owner, /refund/i)

    await page.reload()
    await expect(page.getByText("This order was cancelled")).toBeVisible()
    await expect(page.getByText("Your refund has been sent.")).toBeVisible()
  })
})
