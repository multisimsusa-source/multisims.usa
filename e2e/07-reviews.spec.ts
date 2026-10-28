import { expect, test, type Locator, type Page } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { expectNoHorizontalScroll, expectToast, guestPage, pageAs, PHONE, signIn } from "./support/helpers"

/**
 * Ratings from every side: customers rate the whole order and each SIM (eSIM and SIM
 * card, single and several, replacements), change a rating, and cannot rate too early;
 * dealers rate lines and SIMs; the owner sees, features and hides them, and dealer
 * ratings never reach the website. Orders are seeded in the state each case needs.
 */

const CUSTOMER = testEmail("rev")
const DEALER = testEmail("rev-dealer")
const OTHER_DEALER = testEmail("rev-dealer2")
const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"

type Kind = "esim" | "physical"
type Seed = {
  kind: Kind
  quantity?: number
  status: string
  phase?: "fulfil" | "activate"
  itemStatus?: string
  planStart?: "on_receipt" | "on_date"
  activateOn?: string
  arrived?: boolean
  name?: string
  dealer?: { id: string; batchId: string }
  replacementOf?: { orderId: string; itemId: string }
}

async function plan(kind: Kind) {
  const { data } = await db()
    .from("plans")
    .select("id, name, carrier_id, carriers!inner ( name ), day_packages!inner ( id, days )")
    .eq("product_type", kind)
    .limit(1)
    .single()
  if (!data) throw new Error(`No ${kind} plan in the seed data`)
  const carrier = (Array.isArray(data.carriers) ? data.carriers[0] : data.carriers) as { name: string }
  return { ...data, carrier, pkg: (data.day_packages as { id: string; days: number }[])[0] }
}

async function seedOrder(s: Seed) {
  const p = await plan(s.kind)
  const quantity = s.quantity ?? 1
  const physical = s.kind === "physical"
  const { data: order, error } = await db()
    .from("orders")
    .insert({
      channel: s.dealer ? "dealer" : "website",
      dealer_id: s.dealer?.id ?? null,
      batch_id: s.dealer?.batchId ?? null,
      customer_name: s.name ?? "Rina Patel",
      customer_email: CUSTOMER,
      customer_phone: "+44 7700 900123",
      zip_code: "10001",
      shipping_address: physical ? { line1: "1 Test St", city: "New York", state: "NY", zip: "10001" } : null,
      carrier_id: p.carrier_id,
      plan_id: p.id,
      day_package_id: p.pkg.id,
      carrier_name: p.carrier.name,
      plan_name: p.name,
      product_type: s.kind,
      days: p.pkg.days,
      quantity,
      unit_price_cents: 1000,
      total_cents: s.replacementOf ? 0 : 1000 * quantity,
      plan_start: physical ? (s.planStart ?? "on_receipt") : null,
      activate_on: s.planStart === "on_date" ? s.activateOn : null,
      status: s.status,
      phase: s.phase ?? (physical && s.status !== "queued" ? "activate" : "fulfil"),
      paid_at: new Date().toISOString(),
      shipped_at: physical ? new Date().toISOString() : null,
      fulfilled_at: s.status === "fulfilled" ? new Date().toISOString() : null,
      activation_requested_at: s.arrived ? new Date().toISOString() : null,
      replacement_of: s.replacementOf?.orderId ?? null,
      replaces_item_id: s.replacementOf?.itemId ?? null,
    })
    .select("id, number, public_token")
    .single()
  if (error || !order) throw new Error(`Could not seed the order: ${error?.message}`)
  const itemStatus = s.itemStatus ?? (s.status === "queued" ? "pending" : "fulfilled")
  const { data: items, error: itemsError } = await db()
    .from("order_items")
    .insert(
      Array.from({ length: quantity }, (_, i) => ({
        order_id: order.id,
        seq: i + 1,
        status: itemStatus,
        iccid: itemStatus === "pending" ? null : `890126000000000${String(1000 + i)}`,
        phone_number: s.status === "fulfilled" ? `+1 212 555 ${String(100 + i).padStart(4, "0")}` : null,
        tracking_number: physical && itemStatus !== "pending" ? "9400100000000000000077" : null,
        fulfilled_at: itemStatus === "fulfilled" ? new Date().toISOString() : null,
      }))
    )
    .select("id, seq")
    .order("seq")
  if (itemsError) throw new Error(`Could not seed the SIMs: ${itemsError.message}`)
  return { ...order, items: items as { id: string; seq: number }[] } as { id: string; number: number; public_token: string; items: { id: string; seq: number }[] }
}

async function reviewsOf(orderId: string) {
  const { data } = await db().from("reviews").select("*").eq("order_id", orderId).order("created_at")
  return data ?? []
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

/** Taps a star the way a person does: on the star, not the hidden radio inside it. */
async function tapStar(scope: Locator, stars: string) {
  await scope.locator("label", { has: scope.page().getByRole("radio", { name: stars, exact: true }) }).click()
}

/** The whole-order rating card on the customer's page. */
const orderForm = (page: Page) => page.getByRole("form", { name: "How was your order?" })

async function rateOrder(page: Page, stars: string, comment?: string) {
  const form = orderForm(page)
  await tapStar(form, stars)
  if (comment !== undefined) await form.getByLabel(/Anything to add/).fill(comment)
  await form.getByRole("button", { name: /Send rating|Save changes/ }).click()
}

async function rateInDialog(page: Page, button: RegExp | string, stars: string, comment?: string) {
  await page.getByRole("button", { name: button }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await tapStar(dialog, stars)
  if (comment !== undefined) await dialog.getByLabel(/Anything to add/).fill(comment)
  await dialog.getByRole("button", { name: /Send rating|Save changes/ }).click()
  await expect(dialog).toBeHidden()
}

async function makeDealer(email: string, company: string) {
  const { data, error } = await db().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: company } })
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`)
  await db().from("profiles").insert({ id: data.user.id, role: "dealer", email, full_name: `${company} buyer`, active: true })
  await db().from("dealers").insert({ profile_id: data.user.id, company })
  const { data: batch } = await db().from("order_batches").insert({ dealer_id: data.user.id, total_cents: 5000 }).select("id, number").single()
  return { id: data.user.id, batchId: batch!.id as string, batchNumber: batch!.number as number }
}

test.describe.serial("Ratings", () => {
  test("customer, one eSIM: rate, see it saved, change it; no per-SIM buttons", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled" })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(orderForm(page)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Rate / })).toHaveCount(0)
    await expect(orderForm(page).getByRole("button", { name: "Send rating" })).toBeDisabled()
    await shot(page, "c1-form-phone")

    await rateOrder(page, "5 stars, excellent", "Worked the moment we landed in JFK.")
    await expect(page.getByText("Thanks for rating your order")).toBeVisible()
    await expect(page.getByRole("img", { name: "Rated 5 out of 5" })).toBeVisible()
    await expect(page.getByText("Worked the moment we landed in JFK.")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shot(page, "c1-saved-phone")

    await page.reload()
    await expect(page.getByText("Thanks for rating your order")).toBeVisible()
    await expect(page.getByText("Worked the moment we landed in JFK.")).toBeVisible()

    // Change it: the form opens with what was saved.
    await page.getByRole("button", { name: "Change rating" }).click()
    await expect(orderForm(page).getByRole("radio", { name: "5 stars, excellent" })).toBeChecked()
    await expect(orderForm(page).getByLabel(/Anything to add/)).toHaveValue("Worked the moment we landed in JFK.")
    // Cancel keeps the old rating.
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("img", { name: "Rated 5 out of 5" })).toBeVisible()

    await page.getByRole("button", { name: "Change rating" }).click()
    await rateOrder(page, "3 stars", "Good, but data was slow in Queens.")
    await expect(page.getByText("Good, but data was slow in Queens.")).toBeVisible()
    await expect(page.getByText("(changed)")).toBeVisible()

    const rows = await reviewsOf(order.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ rating: 3, comment: "Good, but data was slow in Queens.", order_item_id: null, display_name: "Rina" })
    expect(rows[0].updated_at).toBeTruthy()
  })

  test("customer, several eSIMs: each SIM rated on its own, apart from the order", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled", quantity: 3, name: "Tomas Berg" })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(page.getByRole("button", { name: /^Rate eSIM \d$/ })).toHaveCount(3)

    await rateInDialog(page, "Rate eSIM 2", "2 stars", "No signal in the subway.")
    await expectToast(page, "Thanks for your rating")
    await expect(page.getByRole("button", { name: "Change your rating of eSIM 2, 2 out of 5" })).toBeVisible()
    await shot(page, "c2-sim-rated-phone")

    // The order itself is still unrated.
    await expect(orderForm(page).getByRole("button", { name: "Send rating" })).toBeVisible()
    await rateOrder(page, "4 stars")
    await expect(page.getByText("Thanks for rating your order")).toBeVisible()

    // Change the SIM rating: the dialog opens filled in.
    await page.getByRole("button", { name: /Change your rating of eSIM 2/ }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("radio", { name: "2 stars", exact: true })).toBeChecked()
    await expect(dialog.getByLabel(/Anything to add/)).toHaveValue("No signal in the subway.")
    await shot(page, "c2-dialog-edit-phone")
    await tapStar(dialog, "4 stars")
    await dialog.getByRole("button", { name: "Save changes" }).click()
    await expectToast(page, "Rating updated")
    await expect(page.getByRole("button", { name: "Change your rating of eSIM 2, 4 out of 5" })).toBeVisible()

    // Closing the dialog without saving changes nothing.
    await page.getByRole("button", { name: "Rate eSIM 3" }).click()
    await tapStar(page.getByRole("dialog"), "1 star, poor")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("button", { name: "Rate eSIM 3" })).toBeVisible()

    const rows = await reviewsOf(order.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.order_item_id === order.items[1].id)).toMatchObject({ rating: 4, comment: "No signal in the subway." })
    expect(rows.find((r) => !r.order_item_id)).toMatchObject({ rating: 4 })
    await expectNoHorizontalScroll(page)
  })

  test("customer, SIM card: no rating in the post; rating opens once it arrives", async ({ browser }) => {
    const order = await seedOrder({ kind: "physical", status: "shipped", phase: "activate", quantity: 2 })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(page.getByText("Got your SIM?")).toBeVisible()
    await expect(orderForm(page)).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Rate / })).toHaveCount(0)

    await page.getByRole("button", { name: "My SIM has arrived, activate it" }).click()
    await expect(page.getByText("Your line is starting up").first()).toBeVisible()
    await expect(orderForm(page)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Rate SIM card \d$/ })).toHaveCount(2)
    await shot(page, "c3-arrived-phone")
    await rateOrder(page, "4 stars", "Arrived in 3 days.")
    await expect(page.getByText("Thanks for rating your order")).toBeVisible()
    await rateInDialog(page, "Rate SIM card 1", "5 stars, excellent")
    await expectToast(page, "Thanks for your rating")
    expect(await reviewsOf(order.id)).toHaveLength(2)
  })

  test("customer, SIM card starting on a later date: rating opens on that date", async ({ browser }) => {
    const later = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
    const order = await seedOrder({ kind: "physical", status: "shipped", phase: "activate", planStart: "on_date", activateOn: later })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(page.getByText(/Your line starts/)).toBeVisible()
    await expect(orderForm(page)).toHaveCount(0)

    // The start date comes: the daily job queues it.
    const today = new Date().toISOString().slice(0, 10)
    await db().from("orders").update({ activate_on: today }).eq("id", order.id)
    await db().rpc("queue_due_activations")
    await page.reload()
    await expect(orderForm(page)).toBeVisible()
  })

  test("customer, SIM card line already live (delivered): rating open", async ({ browser }) => {
    const order = await seedOrder({ kind: "physical", status: "fulfilled", phase: "activate", arrived: true })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(orderForm(page)).toBeVisible()
  })

  test("customer cannot rate too early or a cancelled order", async ({ browser }) => {
    const page = await guestPage(browser)
    for (const status of ["queued", "claimed", "cancelled", "awaiting_payment"]) {
      const order = await seedOrder({ kind: "esim", status, itemStatus: status === "cancelled" ? "cancelled" : "pending" })
      await page.goto(`/order/${order.public_token}`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expect(orderForm(page), `no rating while ${status}`).toHaveCount(0)
      await expect(page.getByRole("button", { name: /^Rate / })).toHaveCount(0)
    }
  })

  test("the server re-checks: an order cancelled while the form was open is refused", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled" })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(orderForm(page)).toBeVisible()
    await db().from("orders").update({ status: "cancelled" }).eq("id", order.id)
    await rateOrder(page, "1 star, poor", "Should not be saved")
    await expect(orderForm(page).getByText("You can rate it once it is delivered.")).toBeVisible()
    // The form keeps what was typed, and the choice.
    await expect(orderForm(page).getByLabel(/Anything to add/)).toHaveValue("Should not be saved")
    expect(await reviewsOf(order.id)).toHaveLength(0)
  })

  test("two taps at once from two screens save one rating", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled" })
    const [a, b] = [await guestPage(browser), await guestPage(browser)]
    await Promise.all([a.goto(`/order/${order.public_token}`), b.goto(`/order/${order.public_token}`)])
    for (const p of [a, b]) await tapStar(orderForm(p), "5 stars, excellent")
    await Promise.all([a, b].map((p) => orderForm(p).getByRole("button", { name: "Send rating" }).click()))
    await expect(a.getByText("Thanks for rating your order")).toBeVisible()
    await expect(b.getByText("Thanks for rating your order")).toBeVisible()
    expect(await reviewsOf(order.id)).toHaveLength(1)
  })

  test("customer with a replacement: old and new SIM rated separately", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled", itemStatus: "replaced" })
    const replacement = await seedOrder({ kind: "esim", status: "fulfilled", replacementOf: { orderId: order.id, itemId: order.items[0].id } })
    const page = await guestPage(browser)
    await page.goto(`/order/${order.public_token}`)
    await expect(page.getByRole("button", { name: "Rate eSIM 1 replacement" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Rate eSIM 1", exact: true })).toBeVisible()
    await rateInDialog(page, "Rate eSIM 1 replacement", "5 stars, excellent", "The new one works.")
    await rateInDialog(page, /^Rate eSIM 1$/, "1 star, poor", "The first one never connected.")
    await shot(page, "c5-replacement-phone")

    expect(await reviewsOf(replacement.id)).toEqual([expect.objectContaining({ order_item_id: replacement.items[0].id, rating: 5 })])
    expect(await reviewsOf(order.id)).toEqual([expect.objectContaining({ order_item_id: order.items[0].id, rating: 1 })])

    // A replacement's own link is not a rating page.
    await page.goto(`/order/${replacement.public_token}`)
    await expect(page.getByRole("heading", { name: "This page is not here" })).toBeVisible()
  })

  test("owner: sees what was rated, features, a changed review leaves the website", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled", name: "Lena Ortiz" })
    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await rateOrder(customer, "5 stars, excellent", "Easiest eSIM I have bought.")
    await expect(customer.getByText("Thanks for rating your order")).toBeVisible()

    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/reviews")
    const row = owner.getByRole("listitem").filter({ hasText: "Easiest eSIM I have bought." })
    await expect(row.getByText("Whole order")).toBeVisible()
    await row.getByRole("switch", { name: "Feature Lena's review on the website" }).click()
    await expectToast(owner, "Featured on the website")
    await shot(owner, "o1-reviews-desktop")

    const visitor = await guestPage(browser)
    await visitor.goto("/")
    await expect(visitor.getByText("Easiest eSIM I have bought.")).toBeVisible()

    // The customer changes it: it comes off until the owner looks again.
    await customer.getByRole("button", { name: "Change rating" }).click()
    await rateOrder(customer, "2 stars", "Stopped working on day 3.")
    await expect(customer.getByText("Stopped working on day 3.")).toBeVisible()
    await visitor.reload()
    await expect(visitor.getByText("Easiest eSIM I have bought.")).toHaveCount(0)
    await expect(visitor.getByText("Stopped working on day 3.")).toHaveCount(0)

    await owner.reload()
    const changed = owner.getByRole("listitem").filter({ hasText: "Stopped working on day 3." })
    await expect(changed.getByText(/changed/)).toBeVisible()
    await expect(changed.getByRole("switch")).not.toBeChecked()

    // The order screen shows it in the rail.
    await owner.goto(`/admin/orders/${order.id}`)
    const panel = owner.getByRole("region", { name: "Ratings" }).or(owner.locator("section", { has: owner.getByRole("heading", { name: "Ratings" }) }))
    await expect(panel.getByText("Stopped working on day 3.")).toBeVisible()
    await shot(owner, "o2-order-rail-desktop")

    // Hidden: off the list and the website, the customer still sees their own.
    await owner.goto("/admin/reviews")
    await owner.getByRole("listitem").filter({ hasText: "Stopped working on day 3." }).getByRole("button", { name: "Hide" }).click()
    await expectToast(owner, "Hidden")
    await customer.reload()
    await expect(customer.getByText("Stopped working on day 3.")).toBeVisible()
  })

  test("agents do not see ratings on the order screen", async ({ browser }) => {
    const order = await seedOrder({ kind: "esim", status: "fulfilled" })
    await db().from("reviews").insert({ order_id: order.id, rating: 4, comment: "Agent must not see this", display_name: "Rina" })
    const agent = await pageAs(browser, "agent")
    await agent.goto(`/agent/orders/${order.id}`)
    await expect(agent.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(agent.getByText("Agent must not see this")).toHaveCount(0)
  })

  test("dealer rates a line and single SIMs; changes one; the owner sees it as a dealer rating", async ({ browser }) => {
    const dealer = await makeDealer(DEALER, "Global Roam Ltd")
    const line = await seedOrder({ kind: "esim", status: "fulfilled", quantity: 2, dealer })
    const waiting = await seedOrder({ kind: "esim", status: "queued", quantity: 1, dealer })
    const page = await signIn(browser, DEALER, PHONE)
    await page.goto(`/dealer/orders/${dealer.batchId}`)
    await expect(page.getByRole("button", { name: `Rate line MS-${line.number}` })).toBeVisible()
    await expect(page.getByRole("button", { name: `Rate line MS-${waiting.number}` })).toHaveCount(0)
    await expect(page.getByRole("button", { name: new RegExp(`^Rate SIM \\d of MS-${line.number}$`) })).toHaveCount(2)
    await shot(page, "d1-dealer-phone")

    await rateInDialog(page, `Rate line MS-${line.number}`, "4 stars", "Fast as usual.")
    await expectToast(page, "Thanks for your rating")
    await rateInDialog(page, `Rate SIM 2 of MS-${line.number}`, "2 stars", "Customer had no data.")
    await page.getByRole("button", { name: new RegExp(`Change your rating of line MS-${line.number}`) }).click()
    await tapStar(page.getByRole("dialog"), "5 stars, excellent")
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click()
    await expectToast(page, "Rating updated")
    await expectNoHorizontalScroll(page)

    const rows = await reviewsOf(line.id)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.display_name === "Global Roam Ltd")).toBe(true)

    const owner = await pageAs(browser, "owner")
    await owner.goto("/admin/reviews?from=dealer")
    const row = owner.getByRole("listitem").filter({ hasText: "Customer had no data." })
    await expect(row.getByText("Dealer", { exact: true })).toBeVisible()
    await expect(row.getByText("eSIM 2")).toBeVisible()
    await expect(row.getByText("Not for the website")).toBeVisible()
    await expect(row.getByRole("switch")).toHaveCount(0)
    await owner.goto("/admin/reviews?from=website")
    await expect(owner.getByText("Customer had no data.")).toHaveCount(0)
    await shot(owner, "d2-owner-dealer-filter-desktop")
  })

  test("dealer SIM cards: rating opens once the dealer says the cards arrived", async ({ browser }) => {
    const { data: profile } = await db().from("profiles").select("id").eq("email", DEALER).single()
    const { data: batch } = await db().from("order_batches").insert({ dealer_id: profile!.id, total_cents: 2000 }).select("id").single()
    const dealer = { id: profile!.id as string, batchId: batch!.id as string }
    const line = await seedOrder({ kind: "physical", status: "shipped", phase: "activate", quantity: 2, dealer })
    const page = await signIn(browser, DEALER)
    await page.goto(`/dealer/orders/${dealer.batchId}`)
    await expect(page.getByRole("button", { name: `Rate line MS-${line.number}` })).toHaveCount(0)
    await page.getByRole("button", { name: "The cards arrived, activate them" }).click()
    await expectToast(page, "Your lines are starting up")
    await expect(page.getByRole("button", { name: `Rate line MS-${line.number}` })).toBeVisible()
  })

  test("a dealer's rating never reaches the website, even if featured by mistake", async ({ browser }) => {
    const { data: rows } = await db().from("reviews").select("id, order:orders!inner ( channel )").eq("order.channel", "dealer").limit(1)
    await db().from("reviews").update({ featured: true, featured_at: new Date().toISOString() }).eq("id", rows![0].id)
    const visitor = await guestPage(browser)
    await visitor.goto("/")
    await expect(visitor.getByText("Fast as usual.")).toHaveCount(0)
    await expect(visitor.getByText("Customer had no data.")).toHaveCount(0)
  })

  test("another dealer cannot read or rate the first dealer's lines", async ({ browser }) => {
    const other = await makeDealer(OTHER_DEALER, "Other Wireless")
    const { data: line } = await db().from("orders").select("id, batch_id").eq("channel", "dealer").neq("dealer_id", other.id).limit(1).single()
    const page = await signIn(browser, OTHER_DEALER)
    // The page streams, so the answer is the not-found screen rather than a 404 status.
    await page.goto(`/dealer/orders/${line!.batch_id}`)
    await expect(page.getByRole("heading", { name: "This page is not here" })).toBeVisible()
    await expect(page.getByRole("button", { name: /^Rate / })).toHaveCount(0)

    // Their own (empty) session cannot read the first dealer's ratings either.
    const { createClient } = await import("@supabase/supabase-js")
    const env = (await import("./support/env")).supabaseTarget()
    const client = createClient(env.url, env.publishable, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: OTHER_DEALER, password: PASSWORD })
    const { data } = await client.from("reviews").select("id")
    expect(data ?? []).toHaveLength(0)
  })
})
