import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { expectToast, guestPage, pageAs, PHONE } from "./support/helpers"

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
})
