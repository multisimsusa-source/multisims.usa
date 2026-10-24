import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { choose, expectNoHorizontalScroll, expectToast, guestPage, pageAs } from "./support/helpers"

/**
 * Milestone 1: the owner builds the catalogue and the website follows at once.
 * Creates the E2E carrier and two plans the later files order from.
 */
test.describe.serial("Catalogue", () => {
  test("owner adds a carrier", async ({ browser }) => {
    const page = await pageAs(browser, "owner")
    await page.goto("/admin/carriers")
    await page.getByRole("button", { name: "Add carrier" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name", { exact: true }).fill("E2E Mobile")
    await dialog.getByRole("button", { name: "Add carrier" }).click()
    await expect(page.getByText("E2E Mobile").first()).toBeVisible()
  })

  for (const plan of [
    { name: "E2E Unlimited", type: "eSIM", packages: [["7", "11.00", "", "10.00"], ["30", "31.00", "", "29.00"]] },
    { name: "E2E Card", type: "SIM card", packages: [["7", "14.00", "", "12.00"]] },
  ]) {
    test(`owner creates and publishes ${plan.name}`, async ({ browser }) => {
      const page = await pageAs(browser, "owner")
      await page.goto("/admin/plans/new")
      await choose(page, page.locator("#carrier_id"), "E2E Mobile")
      await page.locator("label").filter({ hasText: new RegExp(`^${plan.type}$`) }).click()
      await page.getByLabel("Plan name").fill(plan.name)
      await page.getByLabel("Short summary").fill(`${plan.name} for end-to-end tests.`)
      await page.getByRole("button", { name: "Create plan" }).click()
      await page.waitForURL(/\/admin\/plans\/[0-9a-f-]{36}/)

      const add = page.locator("form").filter({ hasText: "Add a package" })
      for (const [days, price, sale, wholesale] of plan.packages) {
        await add.locator('input[name="days"]').fill(days)
        await add.locator('input[name="price"]').fill(price)
        await add.locator('input[name="sale_price"]').fill(sale)
        await add.locator('input[name="wholesale_price"]').fill(wholesale)
        await add.getByRole("button", { name: "Add" }).click()
        await expectToast(page, `${days}-day package added`)
      }

      await page.getByRole("switch", { name: "Published" }).click()
      await page.getByRole("button", { name: "Save plan" }).click()
      await expectToast(page, /saved|published/i)

      const { data } = await db().from("plans").select("slug, published").eq("name", plan.name).single()
      expect(data?.published).toBe(true)

      const guest = await guestPage(browser)
      await guest.goto(`/plans/${data!.slug}`)
      await expect(guest.getByRole("heading", { name: plan.name })).toBeVisible()
      await expect(guest.getByText(`$${plan.packages[0][1]}`).first()).toBeVisible()
      await expectNoHorizontalScroll(guest)
    })
  }

  test("a price change and a sale price show on the website", async ({ browser }) => {
    test.setTimeout(240_000)
    const page = await pageAs(browser, "owner")
    const { data: plan } = await db().from("plans").select("id, slug").eq("name", "E2E Unlimited").single()
    await page.goto(`/admin/plans/${plan!.id}`)

    const row7 = page.locator("form").filter({ has: page.locator('input[name="days"][value="7"]') }).first()
    await row7.locator('input[name="price"]').fill("12.00")
    await row7.getByRole("button", { name: "Save" }).click()
    await expectToast(page, "Package saved")
    // A saved row redraws with the stored values; start each edit from a fresh page.
    await page.reload()

    const row30 = page.locator("form").filter({ has: page.locator('input[name="days"][value="30"]') }).first()
    await row30.locator('input[name="sale_price"]').fill("28.00")
    await row30.getByRole("button", { name: "Save" }).click()
    await expectToast(page, "Package saved")
    // The save is stored before the website is checked: a stale page is then a cache fault.
    await expect
      .poll(async () => (await db().from("day_packages").select("sale_price_cents").eq("plan_id", plan!.id).eq("days", 30).single()).data?.sale_price_cents)
      .toBe(2800)
    await page.reload()

    // A sale price must be below the price.
    await row30.locator('input[name="sale_price"]').fill("40.00")
    await row30.getByRole("button", { name: "Save" }).click()
    await expectToast(page, "Check the package fields")
    await page.reload()

    const guest = await guestPage(browser)
    // Checkout reads prices live: the new sale price shows there at once.
    await guest.goto(`/checkout?plan=${plan!.slug}&days=30`)
    await expect(guest.getByText("$28.00").filter({ visible: true }).first()).toBeVisible()
    await expect(guest.locator("s").filter({ hasText: "$31.00" }).first()).toBeVisible()

    // The plan page is cached: it shows the change at once, or within seconds when two saves
    // raced (each save expires the cache again five seconds later).
    await expect
      .poll(
        async () => {
          await guest.goto(`/plans/${plan!.slug}`)
          await guest.locator("label").filter({ hasText: "30 days" }).first().click()
          return guest.getByText("Sale price. You save").isVisible()
        },
        { timeout: 30_000, intervals: [1_000, 2_000, 4_000] }
      )
      .toBe(true)
    await expect(guest.getByText("$12.00").first()).toBeVisible()
    await expect(guest.locator("s").filter({ hasText: "$31.00" }).first()).toBeVisible()

    await guest.goto("/plans")
    const card = guest.locator("article").filter({ hasText: "E2E Unlimited" })
    await expect(card.getByText("Sale")).toBeVisible()
  })

  test("hiding the carrier takes its plans off the website, showing it brings them back", async ({ browser }) => {
    const page = await pageAs(browser, "owner")
    const { data: plan } = await db().from("plans").select("slug").eq("name", "E2E Unlimited").single()
    const guest = await guestPage(browser)

    await page.goto("/admin/carriers")
    await page.getByRole("switch", { name: "Hide E2E Mobile from the website" }).click()
    await expectToast(page, "Carrier hidden from the site")
    // The page shows not-found at once. (The 404 status itself can lag up to a minute: the
    // proxy remembers live plans for 60 seconds.)
    await guest.goto(`/plans/${plan!.slug}`)
    await expect(guest.getByRole("heading", { name: "E2E Unlimited" })).toHaveCount(0)
    await guest.goto("/plans")
    await expect(guest.locator("article").filter({ hasText: "E2E Unlimited" })).toHaveCount(0)

    await page.getByRole("switch", { name: "Show E2E Mobile on the website" }).click()
    await expectToast(page, "Carrier shown on the site")
    await guest.goto(`/plans/${plan!.slug}`)
    await expect(guest.getByRole("heading", { name: "E2E Unlimited" })).toBeVisible()
  })
})
