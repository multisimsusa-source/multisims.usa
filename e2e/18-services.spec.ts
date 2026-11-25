import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, confirm, expectNoHorizontalScroll, expectToast, guestPage, orderFor, pageAs, PHONE, signIn, submitAndPay } from "./support/helpers"

/**
 * Zafir, 25 Nov: services on a line the customer already has, priced per carrier by the owner.
 * An eSIM QR code and a number change: website customers pay up front, dealers have the fee
 * held and taken per number once it is done.
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const BUYER = testEmail("service-buyer")
const DEALER = testEmail("service-dealer")
const FIX = (name: string) => `e2e/fixtures/${name}`

async function ledger(orderId: string) {
  const { data } = await db().from("wallet_ledger").select("kind, amount_cents").eq("order_id", orderId)
  const sum = (kind: string) => (data ?? []).filter((r) => r.kind === kind).reduce((s, r) => s + r.amount_cents, 0)
  return { reserve: sum("reserve"), capture: sum("capture"), captures: (data ?? []).filter((r) => r.kind === "capture").length }
}

test.describe.serial("Services", () => {
  let carrierId = ""

  test("the owner prices both services for a carrier", async ({ browser }) => {
    const { data: carrier } = await db().from("carriers").select("id").eq("name", "E2E Mobile").single()
    carrierId = carrier!.id
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/services")
    await expect(owner.getByText(/Website orders are at least/)).toBeVisible()

    const qr = owner.locator('section[aria-labelledby="service-esim_qr"] form').filter({ hasText: "E2E Mobile" })
    await qr.getByLabel("Customer price").fill("20.00")
    await qr.getByLabel("Dealer price").fill("4.00")
    await qr.getByRole("switch").click()
    await qr.getByRole("button", { name: "Save" }).click()
    await expectToast(owner, "Saved and offered")

    // A $3 number change is under the website minimum: offered to dealers only.
    const change = owner.locator('section[aria-labelledby="service-number_change"] form').filter({ hasText: "E2E Mobile" })
    await change.getByLabel("Customer price").fill("x")
    await change.getByRole("switch").click()
    await change.getByRole("button", { name: "Save" }).click()
    await expect(change.getByText("Enter a price, for example 5.00")).toBeVisible()
    await change.getByLabel("Customer price").fill("3.00")
    await change.getByLabel("Dealer price").fill("3.00")
    await change.getByRole("button", { name: "Save" }).click()
    await expectToast(owner, "Saved and offered")
    await owner.reload()
    await expect(change.getByText("Under the website minimum: dealers only")).toBeVisible()
    await owner.screenshot({ path: `${SHOTS}/services-admin.png`, fullPage: true })

    const { data: rows } = await db().from("carrier_services").select("service_code, price_cents, wholesale_price_cents, active").eq("carrier_id", carrierId).order("service_code")
    expect(rows).toEqual([
      { service_code: "esim_qr", price_cents: 2000, wholesale_price_cents: 400, active: true },
      { service_code: "number_change", price_cents: 300, wholesale_price_cents: 300, active: true },
    ])
  })

  test("a customer asks for a QR code; the agent adds it and the customer gets it", async ({ browser }) => {
    const page = await guestPage(browser, PHONE)
    await page.goto("/services")
    // The $3 number change is below the minimum, so the website only offers the QR code.
    await expect(page.getByText("Number change")).toHaveCount(0)
    await choose(page, page.locator("#carrier-choice"), /E2E Mobile/)
    await expect(page.getByText("eSIM QR code fee")).toBeVisible()
    await page.getByLabel("Phone number").fill("(212) 555-0177")
    await page.getByLabel("Full name").fill("Service Buyer")
    await page.getByLabel("Email").fill(BUYER)
    await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900555")
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/services-website-phone.png`, fullPage: true })
    await submitAndPay(page, "Place order", BUYER)
    await expect(page.getByText("A QR code to install your line as an eSIM", { exact: true })).toBeVisible()

    const order = await orderFor(BUYER)
    const { data: full } = await db().from("orders").select("kind, service_code, total_cents, days, product_type").eq("id", order.id).single()
    expect(full).toEqual({ kind: "service", service_code: "esim_qr", total_cents: 2000, days: null, product_type: "esim" })

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await expect(agent.getByText("A QR code for this line, to install it as an eSIM")).toBeVisible()
    // No QR yet: it cannot be delivered.
    await expect(agent.getByRole("button", { name: "Deliver QR codes" }).filter({ visible: true }).first()).toBeDisabled()
    await agent.locator('input[type="file"]').first().setInputFiles(FIX("qr-2.png"))
    await agent.getByRole("button", { name: "Save QR and details" }).click()
    await expectToast(agent, "QR code saved")
    await agent.getByRole("button", { name: "Deliver QR codes" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expect.poll(async () => (await db().from("orders").select("status").eq("id", order.id).single()).data?.status).toBe("fulfilled")

    await page.reload()
    await expect(page.getByRole("img", { name: /QR code/ }).first()).toBeVisible()
  })

  test("a dealer asks for 2 number changes; one is done first, each charged once done", async ({ browser }) => {
    const { data: user } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    const dealerId = user.user!.id
    await db().from("profiles").insert({ id: dealerId, role: "dealer", email: DEALER, full_name: "Service Dealer", active: true })
    await db().from("dealers").insert({ profile_id: dealerId, company: "E2E Service Wireless" })
    await db().from("wallet_ledger").insert({ dealer_id: dealerId, kind: "manual_add", amount_cents: 10_000, note: "E2E funds" })

    const dealer = await signIn(browser, DEALER, PHONE)
    await dealer.goto("/dealer/services")
    await dealer.locator("label").filter({ hasText: "Number change" }).click()
    await choose(dealer, dealer.locator("#service-carrier"), /E2E Mobile/)
    await dealer.getByLabel("Numbers").fill("(305) 555-0181\n(305) 555-0181")
    await expect(dealer.getByText(/repeats a number already in this request/)).toBeVisible()
    await dealer.getByLabel("Numbers").fill("(305) 555-0181\n(305) 555-0182, 8901260000000000182")
    await expect(dealer.getByText(/2 numbers, \$3\.00 each/)).toBeVisible()
    await expectNoHorizontalScroll(dealer)
    await dealer.screenshot({ path: `${SHOTS}/services-dealer-phone.png`, fullPage: true })
    await dealer.getByRole("button", { name: "Ask for 2 numbers" }).filter({ visible: true }).first().click()
    await expectToast(dealer, /placed/)
    await dealer.waitForURL(/\/dealer\/orders\//)

    const { data: order } = await db().from("orders").select("id, quantity, total_cents").eq("dealer_id", dealerId).single()
    expect(order).toMatchObject({ quantity: 2, total_cents: 600 })
    expect((await ledger(order!.id)).reserve).toBe(600)

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order!.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    const first = agent.locator("form").filter({ hasText: "Number 1 of 2" })
    await expect(first.getByText(/Was \+1 \(305\) 555-0181/)).toBeVisible()
    // The same number is not a new one.
    await expect(agent.getByRole("button", { name: /Deliver 1 new number/ })).toHaveCount(0)
    await first.getByLabel("New phone number").fill("+1 305 555 0191")
    await first.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await agent.getByRole("button", { name: "Deliver 1 new number" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver these")
    await expectToast(agent, "1 SIM delivered")
    expect((await ledger(order!.id)).captures).toBe(1)

    const second = agent.locator("form").filter({ hasText: "Number 2 of 2" })
    await second.getByLabel("New phone number").fill("+1 305 555 0192")
    await second.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await agent.getByRole("button", { name: "Deliver new numbers" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expect.poll(async () => (await db().from("orders").select("status").eq("id", order!.id).single()).data?.status).toBe("fulfilled")
    const money = await ledger(order!.id)
    expect(money.capture).toBe(600)

    await dealer.reload()
    await expect(dealer.getByText("New number").first()).toBeVisible()
    await expect(dealer.getByText("+1 (305) 555-0192").first()).toBeVisible()
    await expect(dealer.getByText(/2 of 2/).first()).toBeVisible()
  })

  test("turning a service off hides it", async ({ browser }) => {
    await db().from("carrier_services").update({ active: false }).eq("carrier_id", carrierId)
    // Admin writes go through updateTag; this direct write needs the cache to pass.
    const dealer = await signIn(browser, DEALER, PHONE)
    await expect
      .poll(async () => {
        await dealer.goto("/dealer/services")
        return dealer.getByText("No services yet").count()
      }, { timeout: 90_000, intervals: [5_000] })
      .toBe(1)
  })
})
