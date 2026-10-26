import { expect, test, type Page } from "@playwright/test"

import { db } from "./support/db"
import { testEmail } from "./support/env"
import { expectToast, pageAs, PHONE } from "./support/helpers"

/**
 * Claiming unlocks the fulfilment screen: an agent claims a paid order from the queue
 * (or from the order itself) and every field for the current step becomes editable
 * straight away, without a reload.
 */

const CUSTOMER = testEmail("claim")

type Kind = "esim" | "physical"

async function queuedOrder(kind: Kind, quantity: number, phase: "fulfil" | "activate" = "fulfil") {
  const client = db()
  const { data: plan } = await client
    .from("plans")
    .select("id, name, carrier_id, carriers!inner ( name ), day_packages!inner ( id, days )")
    .eq("product_type", kind)
    .limit(1)
    .single()
  if (!plan) throw new Error(`No ${kind} plan in the seed data`)
  const carrier = (Array.isArray(plan.carriers) ? plan.carriers[0] : plan.carriers) as { name: string }
  const pkg = (plan.day_packages as { id: string; days: number }[])[0]

  const { data: order, error } = await client
    .from("orders")
    .insert({
      channel: "website",
      customer_name: "Claim Test",
      customer_email: CUSTOMER,
      customer_phone: "+44 7700 900123",
      zip_code: "10001",
      shipping_address: kind === "physical" ? { line1: "1 Test St", city: "New York", state: "NY", zip: "10001" } : null,
      carrier_id: plan.carrier_id,
      plan_id: plan.id,
      day_package_id: pkg.id,
      carrier_name: carrier.name,
      plan_name: plan.name,
      product_type: kind,
      days: pkg.days,
      quantity,
      unit_price_cents: 1000,
      total_cents: 1000 * quantity,
      plan_start: kind === "physical" ? "on_receipt" : null,
      status: "queued",
      paid_at: new Date().toISOString(),
      phase,
      activation_requested_at: phase === "activate" ? new Date().toISOString() : null,
    })
    .select("id, number")
    .single()
  if (error || !order) throw new Error(`Could not seed the order: ${error?.message}`)

  const activation = phase === "activate"
  const items = Array.from({ length: quantity }, (_, i) => ({
    order_id: order.id,
    seq: i + 1,
    status: activation ? "fulfilled" : "pending",
    iccid: activation ? `89012600000000${String(1000 + i)}` : null,
    tracking_number: activation ? "9400100000000000000000" : null,
  }))
  const { error: itemsError } = await client.from("order_items").insert(items)
  if (itemsError) throw new Error(`Could not seed the SIMs: ${itemsError.message}`)
  return order as { id: string; number: number }
}

/** Claims from the Waiting list, the way agents normally do, and lands on the order. */
async function claimFromQueue(agent: Page, order: { id: string; number: number }) {
  await agent.goto("/agent")
  const row = agent.getByRole("region", { name: "Waiting" }).getByRole("listitem").filter({ hasText: `MS-${order.number}` })
  await row.getByRole("button", { name: /^Claim/ }).click()
  await expectToast(agent, "Claimed")
  await agent.waitForURL(`**/agent/orders/${order.id}`)
}

async function expectStatus(id: string, status: string) {
  await expect.poll(async () => (await db().from("orders").select("status").eq("id", id).single()).data?.status).toBe(status)
}

test.describe.serial("Claiming unlocks the order", () => {
  test("eSIM order claimed from the queue: QR, phone and ICCID are editable", async ({ browser }) => {
    const order = await queuedOrder("esim", 2)
    const agent = await pageAs(browser, "agent")
    await claimFromQueue(agent, order)
    await expectStatus(order.id, "claimed")

    for (const field of await agent.getByLabel("Phone number", { exact: true }).all()) await expect(field).toBeEnabled()
    for (const field of await agent.getByLabel("ICCID", { exact: true }).all()) await expect(field).toBeEnabled()
    await expect(agent.getByLabel("Phone number", { exact: true })).toHaveCount(2)
    await expect(agent.locator('form input[type="file"]:not([multiple])').first()).toBeEnabled()
    await expect(agent.getByText("Drop, click or paste").first()).toBeVisible()
    await expect(agent.getByRole("button", { name: "Mark complete and deliver" }).filter({ visible: true }).first()).toBeVisible()

    // Saving one SIM keeps the screen editable.
    await agent.getByLabel("Phone number", { exact: true }).first().fill("+1 212 555 0199")
    await agent.getByRole("button", { name: "Save", exact: true }).first().click()
    await expectToast(agent, "Saved")
    await expect(agent.getByLabel("Phone number", { exact: true }).first()).toBeEnabled()
    await agent.reload()
    await expect(agent.getByLabel("Phone number", { exact: true }).first()).toHaveValue("+1 212 555 0199")
    await expect(agent.getByLabel("Phone number", { exact: true }).first()).toBeEnabled()
  })

  test("SIM card order claimed from the queue on a phone: tracking and SIM fields are editable", async ({ browser }) => {
    const order = await queuedOrder("physical", 1)
    const agent = await pageAs(browser, "agent", PHONE)
    await claimFromQueue(agent, order)
    await expectStatus(order.id, "claimed")

    await expect(agent.getByLabel("USPS tracking number")).toBeEnabled()
    await expect(agent.getByLabel("Phone number", { exact: true })).toBeEnabled()
    await expect(agent.getByLabel("ICCID", { exact: true })).toBeEnabled()

    await agent.getByLabel("USPS tracking number").fill("9400100000000000000011")
    await agent.getByRole("button", { name: "Save for all SIMs" }).click()
    await expectToast(agent, "Tracking number saved")
    await agent.getByLabel("ICCID", { exact: true }).fill("8901260000000000111")
    await agent.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await expect(agent.getByLabel("ICCID", { exact: true })).toBeEnabled()
  })

  test("SIM card activation claimed from the queue: phone number editable, tracking locked", async ({ browser }) => {
    const order = await queuedOrder("physical", 1, "activate")
    const agent = await pageAs(browser, "agent")
    await claimFromQueue(agent, order)
    await expectStatus(order.id, "claimed")

    await expect(agent.getByLabel("Phone number", { exact: true })).toBeEnabled()
    await expect(agent.getByLabel("ICCID", { exact: true })).toBeEnabled()
    // The parcel already went out; its tracking number is fixed in this phase.
    await expect(agent.getByLabel("USPS tracking number")).toBeDisabled()
  })

  test("claimed from the order page itself: fields unlock without a reload", async ({ browser }) => {
    const order = await queuedOrder("esim", 1)
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await expect(agent.getByLabel("Phone number", { exact: true })).toBeDisabled()
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await expectStatus(order.id, "claimed")
    await expect(agent.getByLabel("Phone number", { exact: true })).toBeEnabled()
    await expect(agent.getByLabel("ICCID", { exact: true })).toBeEnabled()
  })

  test("the owner can edit an order an agent holds", async ({ browser }) => {
    const order = await queuedOrder("esim", 1)
    const agent = await pageAs(browser, "agent")
    await claimFromQueue(agent, order)
    await expect(agent.getByLabel("Phone number", { exact: true })).toBeEnabled()

    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${order.id}`)
    await expect(owner.getByLabel("Phone number", { exact: true })).toBeEnabled()
  })
})
