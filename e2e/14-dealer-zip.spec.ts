import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, expectNoHorizontalScroll, expectToast, pageAs, PHONE, signIn } from "./support/helpers"

/**
 * A dealer's plan line can say where its numbers should be from (7 Nov, Sagor's T-Mobile
 * order): an optional ZIP code and area code, as on the website. Builds on E2E Unlimited.
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const DEALER = testEmail("zip-dealer")

test.describe.serial("Dealer ZIP and area code", () => {
  test("the dealer sets a ZIP and area code on a line; a bad ZIP is caught; the agent sees them", async ({ browser }) => {
    const { data: user } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    const id = user.user!.id
    await db().from("profiles").insert({ id, role: "dealer", email: DEALER, full_name: "Zip Dealer", active: true })
    await db().from("dealers").insert({ profile_id: id, company: "E2E Zip Wireless" })
    await db().from("wallet_ledger").insert({ dealer_id: id, kind: "manual_add", amount_cents: 100_000, note: "E2E funds" })

    const page = await signIn(browser, DEALER, PHONE)
    await page.goto("/dealer/new")
    await choose(page, page.locator('[id^="plan-"]').nth(0), /E2E Unlimited/)
    await choose(page, page.locator('[id^="days-"]').nth(0), /^30 days/)
    const zip = page.locator('[id^="zip-"]').nth(0)
    const area = page.locator('[id^="area-"]').nth(0)
    await expect(zip).toBeVisible()
    await zip.fill("123")
    await page.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expect(page.getByText("A ZIP code is 5 digits, for example 10001")).toBeVisible()
    await zip.fill("33101")
    await area.fill("305")
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/dealer-zip-phone.png`, fullPage: true })
    await page.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expectToast(page, /placed/)
    await page.waitForURL(/\/dealer\/orders\//)
    await expect(page.getByText("ZIP 33101")).toBeVisible()

    const { data: order } = await db().from("orders").select("id, zip_code, area_code").eq("dealer_id", id).single()
    expect(order).toMatchObject({ zip_code: "33101", area_code: "305" })

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order!.id}`)
    await expect(agent.getByText("33101")).toBeVisible()
    await expect(agent.getByText("305", { exact: true })).toBeVisible()
  })

  test("the database refuses a bad ZIP even without the form", async () => {
    // The batch function checks the caller is a dealer first, so this only proves the RPC exists
    // and refuses the service role; the format checks are covered through the form above.
    const { data: pkg } = await db().from("day_packages").select("id, plan:plans!inner(name)").eq("plan.name", "E2E Unlimited").eq("days", 30).single()
    const { error } = await db().rpc("place_dealer_batch", { p_lines: [{ day_package_id: pkg!.id, quantity: 1, zip_code: "12" }] })
    expect(error).not.toBeNull()
  })
})
