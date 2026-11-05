import { expect, test, type Page } from "@playwright/test"

import { resetRateLimits } from "./support/db"
import { testEmail } from "./support/env"
import { DESKTOP, expectToast, guestPage, pageAs, PHONE } from "./support/helpers"

/**
 * Dealer logins as the owner hands them out: the saved email and password are shown once
 * to copy, sign-in works with exactly those, a reset replaces the old password, and a
 * switched-off login says so. Then the wallet explains its four figures.
 */

const EMAIL = testEmail("login-dealer")
const COMPANY = "E2E Harbor Mobile"
const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"

async function signInAs(page: Page, email: string, password: string) {
  await resetRateLimits()
  await page.goto("/portal/login")
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
}

/** The password shown in the "Saved" view of a login dialog. */
async function savedPassword(owner: Page) {
  const dialog = owner.getByRole("dialog")
  await expect(dialog.getByText("Send these to")).toBeVisible()
  return (await dialog.locator("dd.font-mono").innerText()).trim()
}

let password = ""

test.describe.serial("Dealer logins and wallet", () => {
  test("a password with a space at the end is refused", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/dealers")
    await owner.getByRole("button", { name: "New dealer" }).first().click()
    const dialog = owner.getByRole("dialog")
    await dialog.getByLabel("Name", { exact: true }).fill("Ava Stone")
    await dialog.getByLabel("Email").fill(EMAIL)
    await dialog.getByLabel("Company").fill(COMPANY)
    await dialog.getByLabel("Password").fill("pasted-pass-123 ")
    await dialog.getByRole("button", { name: "Create dealer" }).click()
    await expect(dialog.getByText("Remove the space at the start or end")).toBeVisible()
  })

  test("owner creates a dealer with the suggested password, copies it, the dealer signs in", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/dealers")
    await owner.getByRole("button", { name: "New dealer" }).first().click()
    const dialog = owner.getByRole("dialog")
    await dialog.getByLabel("Name", { exact: true }).fill("Ava Stone")
    await dialog.getByLabel("Email").fill(EMAIL)
    await dialog.getByLabel("Company").fill(COMPANY)
    const suggested = await dialog.getByLabel("Password").inputValue()
    expect(suggested).toHaveLength(14)
    await dialog.getByRole("button", { name: "Create dealer" }).click()
    await expectToast(owner, `${COMPANY} can sign in now`)
    password = await savedPassword(owner)
    expect(password).toBe(suggested)
    await expect(dialog.getByText(EMAIL)).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Copy password" })).toBeVisible()
    await owner.screenshot({ path: `${SHOTS}/p1-saved-login.png` })
    await dialog.getByRole("button", { name: "Done" }).click()
    await expect(dialog).toBeHidden()

    // Email typed with capitals still signs in.
    const dealer = await guestPage(browser, PHONE)
    await signInAs(dealer, EMAIL.toUpperCase(), password)
    await dealer.waitForURL(/\/dealer/)
  })

  test("a wrong password says so", async ({ browser }) => {
    const page = await guestPage(browser, DESKTOP)
    await signInAs(page, EMAIL, `${password}x`)
    await expect(page.getByText("That email and password do not match.")).toBeVisible()
  })

  test("owner resets the password: the new one works, the old one does not", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/dealers")
    await owner.getByRole("link", { name: COMPANY }).click()
    await owner.getByRole("button", { name: "Password" }).click()
    await owner.getByRole("dialog").getByRole("button", { name: "Change password" }).click()
    const next = await savedPassword(owner)
    expect(next).not.toBe(password)
    await owner.screenshot({ path: `${SHOTS}/p1-reset.png` })

    const old = await guestPage(browser, DESKTOP)
    await signInAs(old, EMAIL, password)
    await expect(old.getByText("That email and password do not match.")).toBeVisible()

    const fresh = await guestPage(browser, DESKTOP)
    await signInAs(fresh, EMAIL, next)
    await fresh.waitForURL(/\/dealer/)
    password = next
  })

  test("the wallet explains each figure", async ({ browser }) => {
    const page = await guestPage(browser, PHONE)
    await signInAs(page, EMAIL, password)
    await page.waitForURL(/\/dealer/)
    await page.goto("/dealer/wallet")
    await expect(page.getByText("Total money in your wallet")).toBeVisible()
    await expect(page.getByText("Reserved for orders and refills not done yet. Taken as each SIM is delivered, shipped or refilled, and returned if cancelled.")).toBeVisible()
    await expect(page.getByText("Balance minus held", { exact: true })).toBeVisible()
    await expect(page.getByText("Credit limit", { exact: true })).toBeVisible()
    await expect(page.getByText("Extra amount you can spend beyond your balance (0 unless agreed)")).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/p1-wallet-phone.png`, fullPage: true })
  })

  test("a switched-off dealer is told so, not 'wrong password'", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/dealers")
    await owner.getByRole("link", { name: COMPANY }).click()
    await owner.getByRole("switch", { name: `${COMPANY} can sign in` }).click()
    await expectToast(owner, "Dealer suspended")

    const page = await guestPage(browser, DESKTOP)
    await signInAs(page, EMAIL, password)
    await expect(page.getByText("This account is switched off. Contact the MultiSims USA team.")).toBeVisible()
    await expect(page).toHaveURL(/\/portal\/login/)

    // Switched on again: signs in.
    await owner.getByRole("switch", { name: `${COMPANY} can sign in` }).click()
    await expectToast(owner, /./)
    const again = await guestPage(browser, DESKTOP)
    await signInAs(again, EMAIL, password)
    await again.waitForURL(/\/dealer/)
  })
})
