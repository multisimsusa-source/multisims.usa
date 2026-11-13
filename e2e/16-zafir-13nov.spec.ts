import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { testEmail } from "./support/env"
import { choose, expectToast, guestPage, pageAs, PHONE, signIn } from "./support/helpers"

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"

/**
 * What Zafir raised on the 13 Nov call: owner alerts, carrier logos, data-only plans, the
 * SIM card details rule, activating a SIM card he already has, one plan for eSIM and SIM card.
 */

test.describe.serial("Zafir 13 Nov", () => {
  test("the alert email takes several addresses and sends a test", async ({ browser }) => {
    const { data: before } = await db().from("settings").select("owner_email").single()
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/settings")
    const field = owner.getByLabel("Your alert email")
    await field.fill("owner@multisims.test, not-an-email")
    await owner.getByRole("button", { name: "Save settings" }).click()
    await expect(owner.getByText("Enter valid email addresses, separated by commas")).toBeVisible()
    await field.fill("Owner@MultiSims.test,  second@multisims.test, owner@multisims.test")
    await owner.getByRole("button", { name: "Save settings" }).click()
    await expectToast(owner, "Settings saved")
    const { data: saved } = await db().from("settings").select("owner_email").single()
    expect(saved?.owner_email).toBe("owner@multisims.test, second@multisims.test")

    // Email is off locally: the test says where it would go.
    await owner.getByRole("button", { name: "Send test email" }).click()
    await expectToast(owner, /owner@multisims\.test, second@multisims\.test/)
    await db().from("settings").update({ owner_email: before?.owner_email ?? null }).eq("id", true)
  })

  test("an uploaded logo keeps its colours in light and dark mode", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/carriers")
    await owner.getByRole("button", { name: "Edit E2E Mobile" }).click()
    const dialog = owner.getByRole("dialog")
    // A PNG with a solid white background, like a JPG logo: it used to turn into a white block.
    await dialog.locator('input[name="logo"]').setInputFiles("e2e/fixtures/qr-2.png")
    await dialog.getByRole("button", { name: "Save carrier" }).click()
    await expectToast(owner, /saved/i)

    for (const scheme of ["light", "dark"] as const) {
      const page = await guestPage(browser, PHONE)
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto("/plans")
      const logo = page.getByRole("img", { name: "E2E Mobile" }).first()
      await expect(logo).toBeVisible()
      // No whitening or blacking out on an uploaded logo.
      expect(await logo.evaluate((el) => getComputedStyle(el).filter)).toBe("none")
      if (scheme === "dark") {
        expect(await logo.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor)).toMatch(/255, 255, 255|oklch\(1 0 0\)/)
      }
      await page.screenshot({ path: `${SHOTS}/logo-${scheme}.png` })
    }

    // Back to no logo, so other runs start the same.
    await owner.goto("/admin/carriers")
    await owner.getByRole("button", { name: "Edit E2E Mobile" }).click()
    await owner.getByRole("dialog").getByLabel("Remove").check()
    await owner.getByRole("dialog").getByRole("button", { name: "Save carrier" }).click()
    await expectToast(owner, /saved/i)
  })

  test("a data-only SIM card plan: no calls or texts shown, and it can activate a SIM card the buyer has", async ({ browser }) => {
    const { data: carrier } = await db().from("carriers").select("id").eq("name", "E2E Mobile").single()
    const { data: plan } = await db()
      .from("plans")
      .insert({ carrier_id: carrier!.id, name: "E2E Data Only", slug: "e2e-data-only", product_type: "physical", data_gb: 5, published: true, refillable: false })
      .select("id")
      .single()
    await db().from("day_packages").insert({ plan_id: plan!.id, days: 30, price_cents: 2500, active: true })

    // The owner clears Talk and Text and saves: allowed now, and the site refreshes.
    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/plans/${plan!.id}`)
    await owner.getByLabel(/^Talk/).fill("")
    await owner.getByLabel(/^Text/).fill("")
    await owner.getByRole("button", { name: "Save plan" }).click()
    await expectToast(owner, /saved/i)
    const { data: saved } = await db().from("plans").select("talk, sms").eq("id", plan!.id).single()
    expect(saved).toEqual({ talk: "", sms: "" })

    const guest = await guestPage(browser, PHONE)
    await guest.goto("/plans?carrier=e2e-mobile")
    await expect(guest.locator("article").filter({ hasText: "E2E Data Only" }).getByText("Data only, no calls or texts")).toBeVisible()
    await guest.goto("/plans/e2e-data-only")
    await expect(guest.getByText("Not included, data only")).toBeVisible()
    await guest.screenshot({ path: `${SHOTS}/data-only-plan.png`, fullPage: true })

    // Not offered for refills, yet it activates a SIM card the buyer already has.
    await guest.getByRole("link", { name: "Activate it with this plan" }).click()
    await guest.waitForURL(/\/refill\?mode=activate/)
    await expect(guest.locator("#plan-choice")).toContainText("E2E Data Only")
    await expect(guest.locator("#eid")).toBeVisible()
    await expect(guest.locator("#imei")).toHaveCount(0)
    await guest.locator("#days-choice").click()
    await guest.getByRole("option", { name: /^30 days/ }).click()
    await guest.getByLabel("ICCID").fill("8901260000000000777")
    await guest.getByLabel("US ZIP code").fill("10001")
    await guest.getByLabel("Full name").fill("Has A Card")
    await guest.getByLabel("Email").fill("e2e-has-card@multisims.test")
    await guest.getByLabel("Phone or WhatsApp").fill("+44 7700 900666")
    await guest.getByRole("button", { name: /Activate|Pay|Place/ }).filter({ visible: true }).first().click()
    await guest.waitForURL(/\/order\//)
    const { data: order } = await db().from("orders").select("id, kind, shipping_address, sim_card_price_cents").eq("customer_email", "e2e-has-card@multisims.test").single()
    expect(order).toMatchObject({ kind: "activation", shipping_address: null, sim_card_price_cents: 0 })

    await db().from("orders").delete().eq("id", order!.id)
    await db().from("plans").delete().eq("id", plan!.id)
  })

  test("one plan sold as eSIM and SIM card: the buyer and the dealer pick", async ({ browser }) => {
    const { data: carrier } = await db().from("carriers").select("id").eq("name", "E2E Mobile").single()
    const { data: plan } = await db()
      .from("plans")
      .insert({ carrier_id: carrier!.id, name: "E2E Both Ways", slug: "e2e-both-ways", sells_esim: true, sells_sim: true, data_gb: 20, published: true })
      .select("id, product_type")
      .single()
    expect(plan!.product_type).toBe("esim")
    await db().from("day_packages").insert({ plan_id: plan!.id, days: 30, price_cents: 3000, wholesale_price_cents: 2000, active: true })

    // Saved once by the owner (the site refreshes); both boxes are ticked.
    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/plans/${plan!.id}`)
    await expect(owner.locator('input[name="sells_esim"]')).toBeChecked()
    await expect(owner.locator('input[name="sells_sim"]')).toBeChecked()
    await owner.getByRole("button", { name: "Save plan" }).click()
    await expectToast(owner, /saved/i)

    const guest = await guestPage(browser, PHONE)
    await guest.goto("/plans?type=physical")
    await expect(guest.getByRole("heading", { name: "E2E Both Ways" })).toBeVisible()
    await guest.goto("/plans?type=esim")
    await expect(guest.getByRole("heading", { name: "E2E Both Ways" })).toBeVisible()

    await guest.goto("/plans/e2e-both-ways")
    await expect(guest.getByText("eSIM or SIM card?")).toBeVisible()
    const buy = guest.getByRole("link", { name: "Buy now" })
    await expect(buy).toHaveAttribute("href", /product=esim/)
    await guest.locator("label").filter({ hasText: /^SIM card$/ }).click()
    await expect(buy).toHaveAttribute("href", /product=physical/)
    await expect(guest.getByText(/Plus the SIM card/)).toBeVisible()
    await guest.screenshot({ path: `${SHOTS}/both-ways-plan.png`, fullPage: true })
    await buy.click()
    await guest.waitForURL(/\/checkout/)
    await expect(guest.getByText("Delivery address")).toBeVisible()

    // The eSIM way: no delivery address, and the order is an eSIM.
    await guest.goto("/checkout?plan=e2e-both-ways&days=30&product=esim")
    await expect(guest.getByText("Delivery address")).toHaveCount(0)
    await guest.getByLabel("Full name").fill("Both Ways")
    await guest.getByLabel("Email").fill("e2e-both-ways@multisims.test")
    await guest.getByLabel("Phone or WhatsApp").fill("+44 7700 900777")
    await guest.getByLabel("US ZIP code").fill("10001")
    await guest.getByRole("button", { name: /Place order|Continue to payment/ }).filter({ visible: true }).first().click()
    await guest.waitForURL(/\/order\//)
    const { data: web } = await db().from("orders").select("id, product_type, shipping_cents").eq("customer_email", "e2e-both-ways@multisims.test").single()
    expect(web).toMatchObject({ product_type: "esim", shipping_cents: 0 })

    // A dealer picks SIM card on the line: device details ask for the EID and ICCID.
    const dealer = await signIn(browser, testEmail("device-dealer"), PHONE)
    await dealer.goto("/dealer/new")
    await choose(dealer, dealer.locator('[id^="plan-"]').nth(0), /E2E Both Ways/)
    await choose(dealer, dealer.locator('[id^="days-"]').nth(0), /^30 days/)
    await dealer.locator("label").filter({ hasText: /^SIM card$/ }).click()
    await expect(dealer.getByText(/One SIM per row: EID, ICCID/)).toBeVisible()
    await dealer.getByLabel("Street address").fill("1 Market Street")
    await dealer.getByLabel("City").fill("San Francisco")
    await choose(dealer, dealer.locator("#state"), "California")
    await dealer.getByLabel("ZIP code", { exact: true }).fill("94105")
    await dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expectToast(dealer, /placed/)
    const { data: line } = await db().from("orders").select("id, product_type, sim_card_price_cents").eq("plan_id", plan!.id).eq("channel", "dealer").single()
    expect(line!.product_type).toBe("physical")
    expect(line!.sim_card_price_cents).toBeGreaterThan(0)

    await db().from("wallet_ledger").delete().eq("order_id", line!.id)
    await db().from("orders").delete().in("id", [web!.id, line!.id])
    await db().from("plans").delete().eq("id", plan!.id)
  })
})
