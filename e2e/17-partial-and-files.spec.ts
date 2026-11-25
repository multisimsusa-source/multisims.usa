import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { choose, confirm, expectNoHorizontalScroll, expectToast, guestPage, orderFor, pageAs, PHONE, signIn } from "./support/helpers"

/**
 * Zafir, 25 Nov: a bulk line goes out in parts (the ready SIMs now, the rest later, or the
 * owner cancels the rest), and photos and videos on support requests from both sides.
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const DEALER = testEmail("partial-dealer")
const BUYER = testEmail("device-buyer")

async function ledger(orderId: string) {
  const { data } = await db().from("wallet_ledger").select("kind, amount_cents").eq("order_id", orderId)
  const sum = (kind: string) => (data ?? []).filter((r) => r.kind === kind).reduce((s, r) => s + r.amount_cents, 0)
  return { reserve: sum("reserve"), capture: sum("capture"), release: sum("release"), captures: (data ?? []).filter((r) => r.kind === "capture").length }
}

test.describe.serial("Partial delivery and request files", () => {
  let dealerId = ""
  let esimOrder = ""

  test("a dealer's 3 eSIMs: the agent delivers the 2 that are ready, the third stays", async ({ browser }) => {
    const { data: user } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    dealerId = user.user!.id
    await db().from("profiles").insert({ id: dealerId, role: "dealer", email: DEALER, full_name: "Partial Dealer", active: true })
    await db().from("dealers").insert({ profile_id: dealerId, company: "E2E Partial Wireless" })
    await db().from("wallet_ledger").insert({ dealer_id: dealerId, kind: "manual_add", amount_cents: 100_000, note: "E2E funds" })

    const dealer = await signIn(browser, DEALER, PHONE)
    await dealer.goto("/dealer/new")
    await choose(dealer, dealer.locator('[id^="plan-"]').nth(0), /E2E Unlimited/)
    await choose(dealer, dealer.locator('[id^="days-"]').nth(0), /^30 days/)
    await dealer.getByLabel("Quantity").first().fill("3")
    await dealer.getByLabel("Quantity").first().blur()
    await dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expectToast(dealer, /placed/)
    await dealer.waitForURL(/\/dealer\/orders\//)
    const { data: order } = await db().from("orders").select("id").eq("dealer_id", dealerId).single()
    esimOrder = order!.id

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${esimOrder}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    // Nothing ready yet: no part delivery offered.
    await expect(agent.getByRole("button", { name: /ready eSIM/ })).toHaveCount(0)
    for (const [i, phone] of [[1, "+1 646 555 0401"], [2, "+1 646 555 0402"]] as const) {
      const form = agent.locator("form").filter({ hasText: `eSIM ${i} of 3` })
      await form.getByLabel("Phone number").fill(phone)
      await form.getByRole("button", { name: "Save", exact: true }).click()
      await expectToast(agent, "Saved")
    }
    await agent.getByRole("button", { name: "Deliver 2 ready eSIMs" }).filter({ visible: true }).first().click()
    await expect(agent.getByRole("alertdialog")).toContainText("The other 1 stay here")
    await confirm(agent, "Deliver these")
    await expectToast(agent, "2 SIMs delivered")

    const { data: items } = await db().from("order_items").select("seq, status, plan_ends_on").eq("order_id", esimOrder).order("seq")
    expect(items!.map((i) => i.status)).toEqual(["fulfilled", "fulfilled", "pending"])
    expect(items![0].plan_ends_on).not.toBeNull()
    const { data: still } = await db().from("orders").select("status").eq("id", esimOrder).single()
    expect(still!.status).toBe("claimed")
    expect((await ledger(esimOrder)).captures).toBe(2)
    // Delivered SIMs are locked; the third is still to fill.
    await expect(agent.locator("form").filter({ hasText: "eSIM 1 of 3" }).getByLabel("Phone number")).toBeDisabled()
    await expect(agent.locator("form").filter({ hasText: "eSIM 3 of 3" }).getByLabel("Phone number")).toBeEnabled()
    await agent.screenshot({ path: `${SHOTS}/partial-agent.png`, fullPage: true })

    await agent.goto("/agent")
    await expect(agent.getByText(/2 of 3 delivered/).first()).toBeVisible()

    // The dealer sees the two numbers as delivered and the third still processing.
    await dealer.reload()
    await expect(dealer.getByText("+1 (646) 555-0401").first()).toBeVisible()
    await expect(dealer.getByText("Processing").first()).toBeVisible()
    await expectNoHorizontalScroll(dealer)
    await dealer.screenshot({ path: `${SHOTS}/partial-dealer-phone.png`, fullPage: true })
  })

  test("the owner cancels the rest: the order is done and the rest goes back to the wallet", async ({ browser }) => {
    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${esimOrder}`)
    // Cancelling the whole order would mark delivered SIMs cancelled: only the rest is offered.
    await expect(owner.getByRole("button", { name: "Cancel order" })).toHaveCount(0)
    await owner.getByRole("button", { name: "Cancel the other 1" }).click()
    const dialog = owner.getByRole("dialog")
    await expect(dialog).toContainText("back to the dealer's wallet")
    await dialog.getByRole("textbox").fill("No more lines in this area")
    await dialog.getByRole("button", { name: "Cancel the rest" }).click()
    await expectToast(owner, /back on the dealer's wallet/)

    const { data: order } = await db().from("orders").select("status").eq("id", esimOrder).single()
    expect(order!.status).toBe("fulfilled")
    const { data: items } = await db().from("order_items").select("status").eq("order_id", esimOrder).order("seq")
    expect(items!.map((i) => i.status)).toEqual(["fulfilled", "fulfilled", "cancelled"])
    const money = await ledger(esimOrder)
    expect(money.reserve).toBe(money.capture + money.release)
    expect(money.release).toBeGreaterThan(0)
    const { data: wallet } = await db().rpc("dealer_wallet", { p_dealer_id: dealerId })
    expect(Number((wallet as { reserved_cents: number }[])[0].reserved_cents)).toBe(0)

    await owner.reload()
    await expect(owner.getByText("not delivered, cancelled by the owner.")).toBeVisible()
  })

  test("activating 2 cards a dealer has: one goes live first, then the other", async ({ browser }) => {
    const dealer = await signIn(browser, DEALER, PHONE)
    await dealer.goto("/dealer/new")
    await choose(dealer, dealer.locator('[id^="plan-"]').nth(0), /E2E Card/)
    await choose(dealer, dealer.locator('[id^="days-"]').nth(0), /^7 days/)
    await dealer.getByLabel("Quantity").first().fill("2")
    await dealer.getByLabel("Quantity").first().blur()
    await dealer.locator("label").filter({ hasText: "I already have the SIM cards" }).click()
    await dealer.locator('[id^="devices-"]').first().fill("8901260000000000411\n8901260000000000412")
    await dealer.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expectToast(dealer, /placed/)
    const { data: order } = await db().from("orders").select("id").eq("dealer_id", dealerId).eq("kind", "activation").single()

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order!.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    const first = agent.locator("form").filter({ hasText: "SIM 1 of 2" })
    await first.getByLabel("Phone number").fill("+1 646 555 0411")
    await first.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await expect(agent.getByRole("button", { name: "Mark active and deliver" }).filter({ visible: true }).first()).toBeDisabled()
    await expect(agent.getByText(/You can deliver the ready ones now/)).toBeVisible()
    await agent.getByRole("button", { name: "Deliver 1 active line" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver these")
    await expectToast(agent, "1 SIM delivered")
    expect((await ledger(order!.id)).captures).toBe(1)

    const second = agent.locator("form").filter({ hasText: "SIM 2 of 2" })
    await second.getByLabel("Phone number").fill("+1 646 555 0412")
    await second.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await agent.getByRole("button", { name: "Mark active and deliver" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expect.poll(async () => (await db().from("orders").select("status").eq("id", order!.id).single()).data?.status).toBe("fulfilled")
    const money = await ledger(order!.id)
    expect(money.captures).toBe(2)
    expect(money.capture).toBe(money.reserve)
  })

  test("customer and support add photos and videos to a request", async ({ browser }) => {
    const order = await orderFor(BUYER)
    const { data: type } = await db().from("ticket_types").select("id, name").eq("active", true).limit(1).single()
    const { data: ticket } = await db()
      .from("tickets")
      .insert({ order_id: order.id, ticket_type_id: type!.id, type_name: type!.name, severity: "medium", description: "The line shows no signal at all since this morning, even after a restart." })
      .select("id, number")
      .single()

    const customer = await guestPage(browser, PHONE)
    await customer.goto(`/order/${order.public_token}`)
    const request = customer.locator("li").filter({ hasText: `#${ticket!.number}` })
    await expect(request.getByText("A photo or short video of the problem helps us fix it faster.")).toBeVisible()
    const input = request.locator('input[type="file"]')
    // Too big is stopped before it uploads.
    await input.setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(11 * 1024 * 1024, 1) })
    await expectToast(customer, "That photo is over 10 MB")
    await input.setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") })
    await expectToast(customer, /Use a photo/)
    await input.setInputFiles("e2e/fixtures/qr-2.png")
    await expectToast(customer, "Photo added")
    await input.setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(200 * 1024, 7) })
    await expectToast(customer, "Video added")
    await expect(request.getByText("2 of 20", { exact: false })).toBeVisible()
    await expect(request.locator("video")).toHaveCount(1)
    await expectNoHorizontalScroll(customer)
    await customer.screenshot({ path: `${SHOTS}/ticket-files-customer.png`, fullPage: true })

    // Support sees both, adds one of their own, and is told in the portal.
    const { count: rang } = await db().from("notifications").select("id", { count: "exact", head: true }).eq("kind", "ticket_file").ilike("title", `%#${ticket!.number}`)
    expect(rang).toBeGreaterThan(0)
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/tickets/${ticket!.id}`)
    const files = agent.locator('section[aria-labelledby="ticket-files"]')
    await expect(files.getByText("Customer", { exact: true })).toHaveCount(2)
    await files.locator('input[type="file"]').setInputFiles("e2e/fixtures/qr-2.png")
    await expectToast(agent, "Photo added")
    await expect(files.getByText("Support", { exact: true })).toHaveCount(1)
    await agent.screenshot({ path: `${SHOTS}/ticket-files-agent.png`, fullPage: true })

    await customer.reload()
    await expect(request.getByText("From us", { exact: true })).toBeVisible()

    // Once resolved, the customer can no longer add, but still sees the files.
    await db().from("tickets").update({ status: "resolved" }).eq("id", ticket!.id)
    await customer.reload()
    await expect(request.getByRole("button", { name: "Add photo or video" })).toHaveCount(0)
    await expect(request.locator("img")).toHaveCount(2)
  })

  test("a dealer adds a photo to their ticket", async ({ browser }) => {
    const { data: type } = await db().from("ticket_types").select("id, name").eq("active", true).limit(1).single()
    const { data: ticket } = await db()
      .from("tickets")
      .insert({ order_id: esimOrder, ticket_type_id: type!.id, type_name: type!.name, severity: "high", description: "SIM 2 will not connect to data, the customer tried two phones already." })
      .select("id, number")
      .single()
    const dealer = await signIn(browser, DEALER, PHONE)
    await dealer.goto("/dealer/tickets")
    const row = dealer.locator(`#t-${ticket!.number}`)
    await row.locator('input[type="file"]').setInputFiles("e2e/fixtures/qr-2.png")
    await expectToast(dealer, "Photo added")
    await expect(row.getByText("You", { exact: true })).toBeVisible()
    await expectNoHorizontalScroll(dealer)
    const { count } = await db().from("ticket_files").select("id", { count: "exact", head: true }).eq("ticket_id", ticket!.id).eq("added_by", "customer")
    expect(count).toBe(1)
  })
})
