import { expect, test } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { db } from "./support/db"
import { AGENT, OWNER, PASSWORD, supabaseTarget, testEmail } from "./support/env"
import { choose, confirm, expectNoHorizontalScroll, expectToast, guestPage, orderFor, pageAs, PHONE, signIn, submitAndPay } from "./support/helpers"

/**
 * The 25 Nov work, beyond the happy paths: SIM cards shipped and activated in parts, a website
 * order delivered in part, who may do what, private files, and services that are off, too
 * expensive, or not changed.
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const DEALER = testEmail("edge-dealer")
const OTHER = testEmail("edge-other")
const BUYER = testEmail("edge-buyer")
const ADDRESS = { line1: "1 Main St", city: "Miami", state: "FL", zip: "33101" }

/** A client signed in as a user, so Postgres checks run as that user (RLS, role checks). */
async function as(email: string): Promise<SupabaseClient> {
  const env = supabaseTarget()
  const client = createClient(env.url, env.publishable, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign in ${email}: ${error.message}`)
  return client
}

async function makeDealer(email: string, company: string, cents: number) {
  const { data: user } = await db().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  const id = user.user!.id
  await db().from("profiles").insert({ id, role: "dealer", email, full_name: company, active: true })
  await db().from("dealers").insert({ profile_id: id, company })
  if (cents) await db().from("wallet_ledger").insert({ dealer_id: id, kind: "manual_add", amount_cents: cents, note: "E2E funds" })
  return id
}

async function ledger(orderId: string) {
  const { data } = await db().from("wallet_ledger").select("kind, amount_cents, note").eq("order_id", orderId).order("id")
  const sum = (kind: string) => (data ?? []).filter((r) => r.kind === kind).reduce((s, r) => s + r.amount_cents, 0)
  return { rows: data ?? [], reserve: sum("reserve"), capture: sum("capture"), release: sum("release") }
}

async function packageOf(plan: string, days: number) {
  const { data } = await db().from("day_packages").select("id, plan:plans!inner(name, carrier_id)").eq("plan.name", plan).eq("days", days).single()
  return data as unknown as { id: string; plan: { carrier_id: string } }
}

test.describe.serial("Edge cases, 25 Nov", () => {
  let dealerId = ""

  test("SIM cards: 2 of 3 shipped first, the third cancelled; shipping is still taken once", async () => {
    dealerId = await makeDealer(DEALER, "E2E Edge Wireless", 200_000)
    const dealer = await as(DEALER)
    const pkg = await packageOf("E2E Card", 7)
    const { data: batch, error } = await dealer.rpc("place_dealer_batch", {
      p_lines: [{ day_package_id: pkg.id, quantity: 3, intl_calling: false, product: "physical" }],
      p_address: ADDRESS,
    })
    expect(error).toBeNull()
    const { data: order } = await db().from("orders").select("id, shipping_cents, total_cents").eq("batch_id", (batch as { id: string }).id).single()
    expect(order!.shipping_cents).toBeGreaterThan(0)

    const agent = await as(AGENT)
    expect((await agent.rpc("claim_order", { p_order_id: order!.id })).error).toBeNull()
    // Nothing ready: refused.
    expect((await agent.rpc("deliver_ready_items", { p_order_id: order!.id })).error?.message).toMatch(/no SIM is ready yet/)
    const { data: items } = await db().from("order_items").select("id, seq").eq("order_id", order!.id).order("seq")
    // SIM 1 is the one that cannot be done: shipping must still be taken with SIM 2.
    for (const [i, iccid] of [[1, "8901260000000000502"], [2, "8901260000000000503"]] as const) {
      expect((await agent.rpc("save_order_item", { p_item_id: items![i].id, p_phone_number: "", p_iccid: iccid, p_qr_path: "", p_tracking_number: "9400100000000000000502" })).error).toBeNull()
    }
    const { data: count, error: partError } = await agent.rpc("deliver_ready_items", { p_order_id: order!.id })
    expect(partError).toBeNull()
    expect(count).toBe(2)
    let money = await ledger(order!.id)
    expect(money.rows.filter((r) => r.kind === "capture").map((r) => r.note)).toEqual([expect.stringMatching(/SIM 2, with shipping/), expect.stringMatching(/SIM 3$/)])

    // A shipped card cannot be edited again.
    expect((await agent.rpc("save_order_item", { p_item_id: items![1].id, p_phone_number: "", p_iccid: "8901260000000000999", p_qr_path: "", p_tracking_number: "x" })).error?.message).toMatch(/claim the order first/)
    // Only the owner may cancel the rest, and the whole order can no longer be cancelled.
    expect((await agent.rpc("cancel_remaining_items", { p_order_id: order!.id, p_reason: "x" })).error?.message).toMatch(/not allowed/)
    const owner = await as(OWNER)
    expect((await owner.rpc("cancel_order", { p_order_id: order!.id, p_reason: "x" })).error?.message).toMatch(/cancel the rest instead/)
    const { data: done, error: cancelError } = await owner.rpc("cancel_remaining_items", { p_order_id: order!.id, p_reason: "Out of cards" })
    expect(cancelError).toBeNull()
    // The two posted cards go on to their activation step.
    expect(done).toMatchObject({ phase: "activate", status: "shipped", claimed_by: null })
    money = await ledger(order!.id)
    expect(money.reserve).toBe(money.capture + money.release)
    expect(money.capture).toBeGreaterThanOrEqual(order!.shipping_cents)
    expect((await owner.rpc("cancel_remaining_items", { p_order_id: order!.id, p_reason: "again" })).error?.message).toMatch(/not open|already posted/)
  })

  test("the posted cards go live one at a time; the dealer sees each line as it goes live", async ({ browser }) => {
    const { data: order } = await db().from("orders").select("id, batch_id").eq("dealer_id", dealerId).eq("kind", "line").single()
    // The dealer's "The cards arrived" runs this as the server.
    expect((await db().rpc("request_activation", { p_order_id: order!.id })).error).toBeNull()
    const agent = await as(AGENT)
    expect((await agent.rpc("claim_order", { p_order_id: order!.id })).error).toBeNull()
    const { data: shipped } = await db().from("order_items").select("id, seq").eq("order_id", order!.id).eq("status", "fulfilled").order("seq")
    expect(shipped).toHaveLength(2)
    await agent.rpc("save_order_item", { p_item_id: shipped![0].id, p_phone_number: "+1 (305) 555-0502", p_iccid: "8901260000000000502", p_qr_path: "", p_tracking_number: "9400100000000000000502" })
    expect((await agent.rpc("deliver_ready_items", { p_order_id: order!.id })).data).toBe(1)
    const { data: first } = await db().from("order_items").select("activated_at, plan_ends_on").eq("id", shipped![0].id).single()
    expect(first!.activated_at).not.toBeNull()
    expect(first!.plan_ends_on).not.toBeNull()
    // A live line is locked; the other is still to do.
    expect((await agent.rpc("save_order_item", { p_item_id: shipped![0].id, p_phone_number: "+1 (305) 555-0999", p_iccid: "8901260000000000502", p_qr_path: "", p_tracking_number: "x" })).error).not.toBeNull()

    const page = await signIn(browser, DEALER, PHONE)
    await page.goto(`/dealer/orders/${order!.batch_id}`)
    await expect(page.getByText("+1 (305) 555-0502").first()).toBeVisible()
    await expect(page.getByText(/1 of 2/).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/edge-dealer-cards-phone.png`, fullPage: true })

    await agent.rpc("save_order_item", { p_item_id: shipped![1].id, p_phone_number: "+1 (305) 555-0503", p_iccid: "8901260000000000503", p_qr_path: "", p_tracking_number: "9400100000000000000502" })
    expect((await agent.rpc("deliver_ready_items", { p_order_id: order!.id })).error?.message).toMatch(/complete the order instead/)
    const { data: complete } = await agent.rpc("complete_order", { p_order_id: order!.id })
    expect(complete).toMatchObject({ status: "fulfilled" })
    const { data: all } = await db().from("order_items").select("status, activated_at").eq("order_id", order!.id).order("seq")
    expect(all!.map((i) => [i.status, Boolean(i.activated_at)])).toEqual([["cancelled", false], ["fulfilled", true], ["fulfilled", true]])
    await page.reload()
    await expect(page.getByText(/2 of 2/).first()).toBeVisible()
  })

  test("a website order of 2 eSIMs: one delivered, the other cancelled; the customer sees both", async ({ browser }) => {
    const { data: plan } = await db().from("plans").select("slug").eq("name", "E2E Unlimited").single()
    const page = await guestPage(browser, PHONE)
    await page.goto(`/checkout?plan=${plan!.slug}&days=30`)
    await page.getByLabel("Full name").fill("Edge Buyer")
    await page.getByLabel("Email").fill(BUYER)
    await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900666")
    await page.getByLabel("US ZIP code").fill("10001")
    await page.getByRole("button", { name: "One more" }).filter({ visible: true }).first().click()
    await submitAndPay(page, "Place order", BUYER)
    const order = await orderFor(BUYER)
    expect(order.quantity).toBe(2)

    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    const first = agent.locator("form").filter({ hasText: "eSIM 1 of 2" })
    await first.locator('input[type="file"]').setInputFiles("e2e/fixtures/qr-2.png")
    await first.getByRole("button", { name: "Save QR and details" }).click()
    await expectToast(agent, "QR code saved")
    await agent.getByRole("button", { name: "Deliver 1 ready eSIM" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver these")
    await expectToast(agent, "1 SIM delivered")
    // An agent never sees the owner's cancel controls.
    await expect(agent.getByRole("button", { name: /Cancel the other/ })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole("img", { name: /QR code/ }).first()).toBeVisible()
    await expect(page.getByText("Processing").first()).toBeVisible()
    await expectNoHorizontalScroll(page)

    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${order.id}`)
    await owner.getByRole("button", { name: "Cancel the other 1" }).click()
    const dialog = owner.getByRole("dialog")
    await expect(dialog).toContainText("Refund the customer for them from your own wallet")
    await dialog.getByRole("textbox").fill("Carrier out of lines")
    await dialog.getByRole("button", { name: "Cancel the rest" }).click()
    await expectToast(owner, /Refund the customer for those SIMs/)

    await page.reload()
    await expect(page.getByText("1 eSIM could not be delivered")).toBeVisible()
    await expect(page.getByText(/in touch with you by email about the refund/)).toBeVisible()
    await expect(page.getByRole("img", { name: /QR code/ }).first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/edge-website-partial-phone.png`, fullPage: true })
  })

  test("ticket files stay private: another dealer cannot read them and the bucket refuses public links", async () => {
    await makeDealer(OTHER, "E2E Other Wireless", 0)
    const { data: order } = await db().from("orders").select("id").eq("dealer_id", dealerId).eq("kind", "line").single()
    const { data: type } = await db().from("ticket_types").select("id, name").eq("active", true).limit(1).single()
    const { data: ticket } = await db()
      .from("tickets")
      .insert({ order_id: order!.id, ticket_type_id: type!.id, type_name: type!.name, severity: "low", description: "Line two drops calls every few minutes, the customer has tried another phone." })
      .select("id")
      .single()
    const path = `${ticket!.id}/check.png`
    await db().storage.from("ticket-files").upload(path, Buffer.from("x"), { contentType: "image/png" })
    await db().from("ticket_files").insert({ ticket_id: ticket!.id, path, content_type: "image/png", size_bytes: 1, kind: "image", added_by: "customer" })

    const mine = await as(DEALER)
    const theirs = await as(OTHER)
    expect((await mine.from("ticket_files").select("id").eq("ticket_id", ticket!.id)).data).toHaveLength(1)
    expect((await theirs.from("ticket_files").select("id").eq("ticket_id", ticket!.id)).data).toHaveLength(0)
    // Nobody but the server may write rows, or read the files directly.
    expect((await mine.from("ticket_files").insert({ ticket_id: ticket!.id, path: `${ticket!.id}/x.png`, content_type: "image/png", size_bytes: 1, kind: "image", added_by: "staff" })).error).not.toBeNull()
    expect((await mine.storage.from("ticket-files").download(path)).error).not.toBeNull()
    const env = supabaseTarget()
    const res = await fetch(`${env.url}/storage/v1/object/public/ticket-files/${path}`)
    expect(res.ok).toBe(false)
    // The bucket takes only photos and videos, whatever the signed link says.
    const { data: signed } = await db().storage.from("ticket-files").createSignedUploadUrl(`${ticket!.id}/page.html`)
    const html = await db().storage.from("ticket-files").uploadToSignedUrl(signed!.path, signed!.token, Buffer.from("<script>alert(1)</script>"), { contentType: "text/html" })
    expect(html.error).not.toBeNull()
  })

  test("services: off, too little money, an unchanged number; a done change updates the line", async () => {
    const { data: carrier } = await db().from("carriers").select("id").eq("name", "E2E Mobile").single()
    await db().from("carrier_services").upsert({ carrier_id: carrier!.id, service_code: "number_change", price_cents: 2000, wholesale_price_cents: 300, active: false })
    const dealer = await as(DEALER)
    const place = (numbers: { phone: string; iccid?: string }[]) =>
      dealer.rpc("place_dealer_service", { p_carrier_id: carrier!.id, p_service_code: "number_change", p_numbers: numbers, p_reference: null })
    // Off: refused.
    expect((await place([{ phone: "+1 (305) 555-0502" }])).error?.message).toMatch(/not offered/)
    await db().from("carrier_services").update({ active: true }).eq("carrier_id", carrier!.id).eq("service_code", "number_change")
    // A bad number and too much: refused, nothing held.
    expect((await place([{ phone: "12" }])).error?.message).toMatch(/not valid/)
    const many = Array.from({ length: 500 }, (_, i) => ({ phone: `+1 (212) 555-${String(1000 + i).slice(-4)}` }))
    const other = await as(OTHER)
    expect((await other.rpc("place_dealer_service", { p_carrier_id: carrier!.id, p_service_code: "number_change", p_numbers: many, p_reference: null })).error?.message).toMatch(/not enough funds/)

    // The number of the line delivered above: the change finds that line and updates it.
    const { data: batch } = await place([{ phone: "+1 (305) 555-0502", iccid: "8901260000000000502" }])
    const { data: order } = await db().from("orders").select("id").eq("batch_id", (batch as { id: string }).id).single()
    const { data: item } = await db().from("order_items").select("id, refill_of_item").eq("order_id", order!.id).single()
    expect(item!.refill_of_item).not.toBeNull()

    const agent = await as(AGENT)
    await agent.rpc("claim_order", { p_order_id: order!.id })
    // The same number, written another way, is not a new number.
    await agent.rpc("save_order_item", { p_item_id: item!.id, p_phone_number: "305-555-0502", p_iccid: "8901260000000000502", p_qr_path: "", p_tracking_number: "" })
    expect((await agent.rpc("complete_order", { p_order_id: order!.id })).error?.message).toMatch(/missing details on 1/)
    await agent.rpc("save_order_item", { p_item_id: item!.id, p_phone_number: "+1 (305) 555-0602", p_iccid: "8901260000000000502", p_qr_path: "", p_tracking_number: "" })
    expect((await agent.rpc("complete_order", { p_order_id: order!.id })).error).toBeNull()
    const { data: line } = await db().from("order_items").select("phone_number").eq("id", item!.refill_of_item!).single()
    expect(line!.phone_number).toBe("+1 (305) 555-0602")
    const { data: kept } = await db().from("order_items").select("old_phone_number").eq("id", item!.id).single()
    expect(kept!.old_phone_number).toBe("+1 (305) 555-0502")
    const money = await ledger(order!.id)
    expect(money.capture).toBe(300)
  })

  test("a website number change above the minimum: ordered, done, and told", async ({ browser }) => {
    // Saved in Admin, as the owner would: the website shows it straight away.
    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/services")
    const row = owner.locator('section[aria-labelledby="service-number_change"] form').filter({ hasText: "E2E Mobile" })
    await row.getByLabel("Customer price").fill("21.00")
    await row.getByRole("button", { name: "Save" }).click()
    await expectToast(owner, "Saved and offered")

    const page = await guestPage(browser, PHONE)
    await page.goto("/services")
    await page.locator("label").filter({ hasText: "Number change" }).click()
    await choose(page, page.locator("#carrier-choice"), /E2E Mobile/)
    await page.getByLabel("Phone number").fill("not a number")
    await page.getByLabel("Full name").fill("Edge Buyer")
    await page.getByLabel("Email").fill(testEmail("edge-change"))
    await page.getByLabel("Phone or WhatsApp").fill("+44 7700 900667")
    await page.getByRole("button", { name: "Place order" }).filter({ visible: true }).first().click()
    await expect(page.getByText("Enter the US number, for example (212) 555-0100")).toBeVisible()
    await page.getByLabel("Phone number").fill("(646) 555-0610")
    await submitAndPay(page, "Place order", testEmail("edge-change"))
    await expect(page.getByText("We are getting your new number")).toBeVisible()

    const order = await orderFor(testEmail("edge-change"))
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await agent.getByRole("button", { name: /^Claim/ }).first().click()
    await expectToast(agent, "Claimed")
    await expect(agent.getByRole("button", { name: "Deliver new numbers" }).filter({ visible: true }).first()).toBeDisabled()
    await agent.getByLabel("New phone number").fill("+1 646 555 0611")
    await agent.getByRole("button", { name: "Save", exact: true }).click()
    await expectToast(agent, "Saved")
    await agent.getByRole("button", { name: "Deliver new numbers" }).filter({ visible: true }).first().click()
    await confirm(agent, "Deliver now")
    await expect.poll(async () => (await db().from("orders").select("status").eq("id", order.id).single()).data?.status).toBe("fulfilled")

    await page.reload()
    await expect(page.getByText("Your new number is below")).toBeVisible()
    await expect(page.getByText("+1 (646) 555-0611").first()).toBeVisible()
    await expect(page.getByText("Delivered").first()).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/edge-number-change-phone.png`, fullPage: true })
  })

  test("the new pages fit a phone, in dark mode too", async ({ browser }) => {
    const owner = await pageAs(browser, "owner", PHONE)
    await owner.emulateMedia({ colorScheme: "dark" })
    await owner.goto("/admin/services")
    await expect(owner.getByRole("heading", { name: "Services", level: 1 })).toBeVisible()
    await expectNoHorizontalScroll(owner)
    await owner.screenshot({ path: `${SHOTS}/edge-admin-services-phone-dark.png`, fullPage: true })
    const dealer = await signIn(browser, DEALER, PHONE)
    await dealer.emulateMedia({ colorScheme: "dark" })
    for (const url of ["/dealer/services", "/dealer/tickets", "/dealer"]) {
      await dealer.goto(url)
      await expectNoHorizontalScroll(dealer)
    }
    await dealer.screenshot({ path: `${SHOTS}/edge-dealer-overview-dark.png`, fullPage: true })
  })
})
