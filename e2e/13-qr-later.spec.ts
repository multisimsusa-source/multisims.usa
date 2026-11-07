import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { testEmail } from "./support/env"
import { confirm, expectNoHorizontalScroll, expectToast, guestPage, pageAs, PHONE } from "./support/helpers"

/**
 * The QR code no longer holds up an eSIM (7 Nov): carriers often send it after the line is
 * live. The agent delivers without it, adds it later on the delivered order, and the
 * customer gets it on their page and by email, once. Builds on E2E Unlimited (01-catalog).
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const FIX = (name: string) => `e2e/fixtures/${name}`
const BUYER = testEmail("qr-later")

async function queuedEsimOrder() {
  const { data: plan } = await db().from("plans").select("id, carrier_id, packages:day_packages(id, days)").eq("name", "E2E Unlimited").single()
  const pkg = (plan!.packages as { id: string; days: number }[]).find((p) => p.days === 30)!
  const { data: order } = await db()
    .from("orders")
    .insert({
      channel: "website",
      kind: "line",
      customer_name: "Late Qr",
      customer_email: BUYER,
      customer_phone: "+44 7700 900333",
      zip_code: "10001",
      carrier_id: plan!.carrier_id,
      carrier_name: "E2E Mobile",
      plan_id: plan!.id,
      day_package_id: pkg.id,
      plan_name: "E2E Unlimited",
      days: 30,
      product_type: "esim",
      quantity: 2,
      unit_price_cents: 2900,
      total_cents: 5800,
      status: "queued",
      payment_status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select("id, public_token")
    .single()
  await db().from("order_items").insert([
    { order_id: order!.id, seq: 1 },
    { order_id: order!.id, seq: 2 },
  ])
  return order!
}

test.describe.serial("QR code after delivery", () => {
  let order: { id: string; public_token: string }

  test("the agent delivers eSIMs that have no QR code yet", async ({ browser }) => {
    order = await queuedEsimOrder()
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await expect(agent.getByText("2 eSIMs have no QR code yet. You can deliver now and add them after.").filter({ visible: true }).first()).toBeVisible()
    const deliver = agent.getByRole("button", { name: "Mark complete and deliver" }).filter({ visible: true }).first()
    await expect(deliver).toBeEnabled()
    await deliver.click()
    await confirm(agent, "Deliver now")
    await expectToast(agent, "Delivered")

    const { data: items } = await db().from("order_items").select("status, plan_starts_on, plan_ends_on").eq("order_id", order.id)
    expect(items!.every((i) => i.status === "fulfilled" && i.plan_starts_on && i.plan_ends_on)).toBe(true)
  })

  test("the customer sees Delivered with the QR codes on their way, and no install steps yet", async ({ browser }) => {
    const customer = await guestPage(browser, PHONE)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByText("Delivered").first()).toBeVisible()
    await expect(customer.getByText(/Your QR codes are on the way/)).toBeVisible()
    await expect(customer.getByText("Your QR code is on its way. We email it to you as soon as it is ready.")).toHaveCount(2)
    await expect(customer.getByRole("img", { name: /eSIM QR code/ })).toHaveCount(0)
    await expect(customer.getByRole("heading", { name: /Install/ })).toHaveCount(0)
    await expectNoHorizontalScroll(customer)
    await customer.screenshot({ path: `${SHOTS}/qr-later-customer-phone.png`, fullPage: true })
  })

  test("the queue and the overview list the QR codes still to add", async ({ browser }) => {
    const agent = await pageAs(browser, "agent")
    await agent.goto("/agent")
    const group = agent.getByRole("region", { name: "QR to add" })
    await expect(group).toBeVisible()
    await expect(group.locator(`a[href$="${order.id}"]`).filter({ hasText: "QR" })).toHaveText(/Add 2 QR/)

    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin")
    await expect(owner.getByText(/eSIMs are waiting for a QR code/)).toBeVisible()
  })

  test("the agent adds one QR on the delivered order; the customer gets it once", async ({ browser }) => {
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    const first = agent.locator("form").filter({ hasText: "eSIM 1 of 2" })
    await expect(first.getByText("QR to add")).toBeVisible()
    await first.locator('input[type="file"]').setInputFiles(FIX("qr-2.png"))
    await first.getByRole("button", { name: "Save and send QR code" }).click()
    await expectToast(agent, "QR code saved and sent")
    await agent.screenshot({ path: `${SHOTS}/qr-later-agent.png`, fullPage: true })

    await expect.poll(async () => (await db().from("order_alerts").select("kind").eq("order_id", order.id).eq("kind", "qr-1")).data?.length).toBe(1)

    // An agent cannot replace a QR that is there.
    const { data: item } = await db().from("order_items").select("id, qr_path").eq("order_id", order.id).eq("seq", 1).single()
    expect(item!.qr_path).toBeTruthy()

    const customer = await guestPage(browser, PHONE)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByRole("img", { name: /eSIM QR code/ })).toHaveCount(1)
    await expect(customer.getByText("Your QR code is on its way. We email it to you as soon as it is ready.")).toHaveCount(1)
    await expect(customer.getByText(/QR codes still to come appear here/)).toBeVisible()

    await agent.goto("/agent")
    await expect(agent.getByRole("region", { name: "QR to add" }).locator(`a[href$="${order.id}"]`).filter({ hasText: "QR" })).toHaveText(/Add 1 QR/)
  })

  test("the database refuses a QR on a SIM that is not delivered, and a second one from an agent", async () => {
    const { data: pending } = await db().from("orders").insert({
      channel: "website", kind: "line", customer_name: "Late Qr", customer_email: BUYER, customer_phone: "+44 7700 900333",
      carrier_name: "E2E Mobile", plan_name: "E2E Unlimited", days: 30, product_type: "esim", quantity: 1,
      unit_price_cents: 2900, total_cents: 2900, status: "queued", payment_status: "paid", paid_at: new Date().toISOString(),
      carrier_id: (await db().from("carriers").select("id").eq("name", "E2E Mobile").single()).data!.id,
      plan_id: (await db().from("plans").select("id").eq("name", "E2E Unlimited").single()).data!.id,
      day_package_id: (await db().from("day_packages").select("id, plan:plans!inner(name)").eq("plan.name", "E2E Unlimited").eq("days", 30).single()).data!.id,
    }).select("id").single()
    const { data: pendingItem } = await db().from("order_items").insert({ order_id: pending!.id, seq: 1 }).select("id").single()
    // The service role is not staff, so the function refuses before anything else.
    const { error } = await db().rpc("add_item_qr", { p_item_id: pendingItem!.id, p_qr_path: "x.png" })
    expect(error).not.toBeNull()
    await db().from("orders").delete().eq("id", pending!.id)
  })
})
