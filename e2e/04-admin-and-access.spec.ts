import { createClient } from "@supabase/supabase-js"
import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { BASE_URL, DEALER_A, localSupabase, PASSWORD, REMOTE, testEmail } from "./support/env"
import { choose, expectToast, guestPage, pageAs, signIn } from "./support/helpers"

/**
 * The owner's view of everything the earlier files did (dashboard, reports, CSV, search),
 * settings and the contact form, and the walls between roles.
 */
test.describe.serial("Owner tools and access", () => {
  test("dashboard shows sales, deliveries and who did what", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin")
    await expect(owner.getByRole("heading", { name: "Overview" })).toBeVisible()
    for (const label of ["Sales", "Orders paid", "SIMs delivered", "Waiting now", "Dealer funds in"]) {
      await expect(owner.locator("dt").filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible()
    }
    await expect(owner.getByRole("heading", { name: "Sales per day" })).toBeVisible()
    await expect(owner.getByRole("heading", { name: "SIMs delivered by carrier" })).toBeVisible()
    await expect(owner.getByText("E2E Agent")).toBeVisible()
    await expect(owner.getByRole("link", { name: "E2E Southern Cross" })).toBeVisible()

    await choose(owner, owner.getByRole("combobox", { name: "Date range" }), "Last 7 days")
    await expect(owner).toHaveURL(/range=7d/)
  })

  test("reports: by carrier with tickets and replacements, filters, CSV", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/reports?range=7d")
    const carriers = owner.locator("#carriers")
    const row = carriers.getByRole("row").filter({ hasText: "E2E Mobile" })
    await expect(row).toBeVisible()
    // Two website tickets plus the dealer's, one replacement, all on E2E Mobile.
    const cells = await row.getByRole("cell").allInnerTexts()
    expect(Number(cells[5])).toBeGreaterThanOrEqual(2)
    expect(Number(cells[6])).toBe(1)
    await expect(owner.locator("#agents").getByText("E2E Agent")).toBeVisible()
    await expect(owner.locator("#dealers").getByText("E2E Southern Cross")).toBeVisible()

    const csv = await owner.request.get(`${BASE_URL}/admin/reports/export?range=7d&report=carriers`)
    expect(csv.status()).toBe(200)
    expect(await csv.text()).toContain("E2E Mobile")

    // Filter to one dealer: only their lines count.
    await choose(owner, owner.getByRole("combobox", { name: "Dealer" }), "E2E Southern Cross")
    await expect(owner).toHaveURL(/dealer=/)
    await expect(owner.locator("#dealers").getByText("E2E Southern Cross")).toBeVisible()
    await choose(owner, owner.getByRole("combobox", { name: "Channel" }), /^Website$/)
    await expect(owner.getByText(/Nothing in this range with these filters/).first()).toBeVisible()
  })

  test("admin search: orders by batch and dealer, activations by ICCID, customers CSV", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    const { data: batch } = await db().from("order_batches").select("number").eq("reference", "PO E2E-1").single()
    await owner.goto(`/admin/orders?q=B-${batch!.number}`)
    await expect(owner.getByText("2 orders")).toBeVisible()
    await owner.goto("/admin/orders?channel=dealer")
    await expect(owner.getByText("E2E Southern Cross").first()).toBeVisible()

    await owner.goto("/admin/activations?q=8901260000000000102")
    await expect(owner.getByText("8901260000000000102")).toBeVisible()

    const csv = await owner.request.get(`${BASE_URL}/admin/customers/export`)
    expect(csv.status()).toBe(200)
    expect(await csv.text()).toContain(testEmail("esim"))
  })

  test("owner changes a setting and it sticks", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    const { data: before } = await db().from("settings").select("dealer_sim_card_price_cents").single()
    await owner.goto("/admin/settings")
    await owner.getByLabel("Dealer SIM card price (USD)").fill("4.50")
    await owner.getByRole("button", { name: "Save settings" }).click()
    await expectToast(owner, "Settings saved")
    const { data: after } = await db().from("settings").select("dealer_sim_card_price_cents").single()
    expect(after?.dealer_sim_card_price_cents).toBe(450)
    // Put it back for the next run.
    await db().from("settings").update({ dealer_sim_card_price_cents: before!.dealer_sim_card_price_cents }).eq("id", true)
  })

  test("contact form sends a message", async ({ browser }) => {
    // On a real site the message would go to the business inbox.
    test.skip(REMOTE, "Not sent on a real site: it would land in the business inbox")
    const page = await guestPage(browser)
    await page.goto("/contact")
    await page.getByLabel("Name").fill("E2E Visitor")
    await page.getByLabel("Email").fill(testEmail("visitor"))
    await page.getByLabel("Message").fill("Do your eSIMs work on an iPhone 13 bought in the UK?")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible()
  })

  test("each role stays in its own portal; strangers get nothing", async ({ browser }) => {
    const agent = await pageAs(browser, "agent")
    await agent.goto("/admin")
    await expect(agent).toHaveURL(/\/agent$/)
    await agent.goto("/dealer")
    await expect(agent).toHaveURL(/\/agent$/)

    const dealer = await signIn(browser, DEALER_A)
    await dealer.goto("/admin/orders")
    await expect(dealer).toHaveURL(/\/dealer$/)
    await dealer.goto("/agent")
    await expect(dealer).toHaveURL(/\/dealer$/)
    // Asking the database directly with their own login, a dealer gets only their rows.
    const env = localSupabase()
    const asDealer = createClient(env.url, env.publishable, { auth: { persistSession: false } })
    const { data: session } = await asDealer.auth.signInWithPassword({ email: DEALER_A, password: PASSWORD })
    const me = session.user!.id
    const { data: orders } = await asDealer.from("orders").select("dealer_id, channel")
    expect(orders!.length).toBeGreaterThan(0)
    expect(orders!.every((o) => o.dealer_id === me)).toBe(true)
    const { data: ledger } = await asDealer.from("wallet_ledger").select("dealer_id")
    expect(ledger!.every((l) => l.dealer_id === me)).toBe(true)
    const { data: others } = await asDealer.from("dealers").select("profile_id")
    expect(others!.map((d) => d.profile_id)).toEqual([me])
    const { data: settings } = await asDealer.from("settings").select("*")
    expect(settings).toEqual([])
    const { error: writeError } = await asDealer.from("wallet_ledger").insert({ dealer_id: me, kind: "manual_add", amount_cents: 100000, note: "free money" })
    expect(writeError).not.toBeNull()

    const guest = await guestPage(browser)
    for (const path of ["/admin", "/agent", "/dealer"]) {
      await guest.goto(path)
      await expect(guest).toHaveURL(/\/portal\/login/)
    }
    for (const path of ["/admin/customers/export", "/admin/reports/export?report=carriers", "/dealer/activations/export"]) {
      const res = await guest.request.get(`${BASE_URL}${path}`, { maxRedirects: 0 })
      expect([302, 303, 307, 403]).toContain(res.status())
    }
    // An unknown order link shows not-found, and order pages are never indexed. (The page
    // streams, so the status line is 200; the content is the not-found page.)
    await guest.goto(`/order/${"0".repeat(48)}`)
    await expect(guest.getByRole("heading", { name: "This page is not here" }).filter({ visible: true })).toBeVisible()
    await expect(guest.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/)
  })
})
