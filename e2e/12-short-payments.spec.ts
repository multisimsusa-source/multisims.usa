import { expect, test } from "@playwright/test"

import { db } from "./support/db"
import { PASSWORD, testEmail } from "./support/env"
import { expectNoHorizontalScroll, expectToast, guestPage, pageAs, PHONE, signIn } from "./support/helpers"

/**
 * Short crypto payments (7 Nov). A dealer sent 50 USDT for a $50 top-up whose payment page
 * asked 59.56 USDT; 40.65 USDT reached the owner after fees. A short top-up is now credited
 * with what arrived, the rest only if the payment completes later; a short website order waits
 * for the owner, who accepts it or cancels and records the refund. Locally there is no payment
 * provider, so the payments are seeded as the webhook would leave them.
 */

const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots"
const DEALER = testEmail("short-dealer")
const COMPANY = "E2E Short Payments"
const BUYER = testEmail("short-buyer")

async function carrierId() {
  return (await db().from("carriers").select("id").eq("name", "E2E Mobile").single()).data!.id as string
}

async function topUpRows(paymentId: string) {
  const { data } = await db().from("wallet_ledger").select("amount_cents, note").eq("payment_id", paymentId).eq("kind", "topup").order("created_at")
  return data ?? []
}

async function shortOrder() {
  const { data: order } = await db()
    .from("orders")
    .insert({
      channel: "website",
      kind: "card_only",
      customer_name: "Short Payer",
      customer_email: BUYER,
      customer_phone: "+44 7700 900222",
      shipping_address: { line1: "1 Test St", city: "New York", state: "NY", zip: "10001" },
      carrier_id: await carrierId(),
      carrier_name: "E2E Mobile",
      product_type: "physical",
      quantity: 4,
      unit_price_cents: 0,
      sim_card_price_cents: 600,
      total_cents: 2500,
      status: "awaiting_payment",
      payment_status: "partially_paid",
    })
    .select("id, public_token")
    .single()
  await db().from("payments").insert({
    order_id: order!.id,
    provider: "nowpayments",
    provider_payment_id: "5550001",
    price_cents: 2500,
    status: "partially_paid",
    pay_currency: "usdttrc20",
    pay_amount: 29.8,
    actually_paid: 25,
    outcome_amount: 20.31,
    outcome_currency: "usdttrc20",
    received_cents: 2031,
  })
  return order!
}

test.describe.serial("Short payments", () => {
  let dealerId = ""
  let paymentId = ""

  test("a short top-up is credited with what arrived, once; the rest only when it completes", async () => {
    const { data: user } = await db().auth.admin.createUser({ email: DEALER, password: PASSWORD, email_confirm: true })
    dealerId = user.user!.id
    await db().from("profiles").insert({ id: dealerId, role: "dealer", email: DEALER, full_name: "Short Payments", active: true })
    await db().from("dealers").insert({ profile_id: dealerId, company: COMPANY })

    const { data: payment } = await db()
      .from("payments")
      .insert({
        kind: "wallet_topup",
        dealer_id: dealerId,
        provider: "nowpayments",
        provider_payment_id: "5550002",
        price_cents: 5000,
        status: "partially_paid",
        pay_currency: "usdttrc20",
        pay_amount: 59.56004,
        actually_paid: 50,
        outcome_amount: 40.652869,
        outcome_currency: "usdttrc20",
        received_cents: 4065,
      })
      .select("id")
      .single()
    paymentId = payment!.id

    const note = "Short crypto top-up: sent 50 USDT of 59.56004 asked. $40.65 arrived after the payment partner's fees"
    const first = await db().rpc("credit_wallet_topup", { p_payment_id: paymentId, p_target_cents: 4065, p_note: note })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ kind: "topup", amount_cents: 4065, note })
    // The same webhook again adds nothing.
    const again = await db().rpc("credit_wallet_topup", { p_payment_id: paymentId, p_target_cents: 4065, p_note: note })
    expect(again.data?.id ?? null).toBeNull()
    expect(await topUpRows(paymentId)).toHaveLength(1)
    const { data: wallet } = await db().rpc("dealer_wallet", { p_dealer_id: dealerId }).single()
    expect(Number((wallet as { balance_cents: number }).balance_cents)).toBe(4065)
  })

  test("the dealer sees the short top-up and what was added", async ({ browser }) => {
    const page = await signIn(browser, DEALER, PHONE)
    await page.goto("/dealer/wallet")
    await expect(page.getByText("Short, $40.65 added")).toBeVisible()
    await expect(page.getByText(/Short crypto top-up: sent 50 USDT of 59.56004 asked/).first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/short-dealer-wallet-phone.png`, fullPage: true })
    // The top-up form (and its exact-amount note) needs a payment provider, so it is not shown locally.
    await expectNoHorizontalScroll(page)
  })

  test("completing the payment later adds only the rest, and never more than the top-up", async () => {
    const rest = await db().rpc("credit_wallet_topup", { p_payment_id: paymentId, p_target_cents: null, p_note: "Rest of crypto top-up (USDT)" })
    expect(rest.data).toMatchObject({ amount_cents: 935 })
    const over = await db().rpc("credit_wallet_topup", { p_payment_id: paymentId, p_target_cents: 999_999, p_note: null })
    expect(over.data?.id ?? null).toBeNull()
    const rows = await topUpRows(paymentId)
    expect(rows.reduce((sum, r) => sum + r.amount_cents, 0)).toBe(5000)
  })

  test("a short website order: the owner sees what arrived, can accept it, or cancel and record the refund", async ({ browser }) => {
    const order = await shortOrder()

    // The customer is told it was short and not to pay again.
    const customer = await guestPage(browser)
    await customer.goto(`/order/${order.public_token}`)
    await expect(customer.getByText("We received less than the total")).toBeVisible()
    await expect(customer.getByText(/includes the network fee/)).toBeVisible()
    await customer.screenshot({ path: `${SHOTS}/short-customer-phone.png`, fullPage: true })

    const owner = await pageAs(browser, "owner")
    await owner.goto(`/admin/orders/${order.id}`)
    await expect(owner.getByText("Paid short of the $25.00 total")).toBeVisible()
    await expect(owner.getByText(/sent 25 USDT of 29.8 asked, and \$20.31 reached your wallet/)).toBeVisible()
    await expect(owner.getByText("Reached your wallet", { exact: true })).toBeVisible()
    await expect(owner.getByRole("button", { name: "Mark as paid" })).toBeVisible()
    await owner.screenshot({ path: `${SHOTS}/short-admin-desktop.png`, fullPage: true })
    const ownerPhone = await pageAs(browser, "owner", PHONE)
    await ownerPhone.emulateMedia({ colorScheme: "dark" })
    await ownerPhone.goto(`/admin/orders/${order.id}`)
    await expect(ownerPhone.getByText("Paid short of the $25.00 total")).toBeVisible()
    await expectNoHorizontalScroll(ownerPhone)
    await ownerPhone.screenshot({ path: `${SHOTS}/short-admin-phone-dark.png`, fullPage: true })

    // The owner cancels; the refund can now be recorded although the order was never paid.
    await owner.getByRole("button", { name: "Cancel order" }).click()
    await owner.getByRole("dialog").getByRole("textbox").fill("Customer paid short and asked to cancel")
    await owner.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click()
    await expectToast(owner, /cancel/i)
    await expect(owner.getByText("Refund the short payment")).toBeVisible()
    await owner.getByRole("button", { name: "Record refund" }).click()
    await owner.getByRole("dialog").getByRole("textbox").fill("Sent 25 USDT back, transaction abc")
    await owner.getByRole("dialog").getByRole("button", { name: "Record refund" }).click()
    await expectToast(owner, /refund/i)
    const { data: refunded } = await db().from("orders").select("refunded_at").eq("id", order.id).single()
    expect(refunded!.refunded_at).not.toBeNull()

    // An unpaid order with no payment still cannot be marked refunded.
    const { data: unpaid } = await db()
      .from("orders")
      .insert({ ...(await db().from("orders").select("channel, kind, customer_name, customer_email, customer_phone, shipping_address, carrier_id, carrier_name, product_type, quantity, unit_price_cents, sim_card_price_cents, total_cents").eq("id", order.id).single()).data!, status: "cancelled" })
      .select("id")
      .single()
    const { error } = await db().rpc("record_refund", { p_order_id: unpaid!.id, p_note: "x" })
    expect(error).not.toBeNull()
  })

  test("an unpaid order page asks for the exact amount", async ({ browser }) => {
    const { data: order } = await db()
      .from("orders")
      .update({ payment_status: "expired" })
      .eq("customer_email", BUYER)
      .eq("status", "cancelled")
      .select("id")
    expect(order?.length).toBeGreaterThan(0)
    const { data: open } = await db()
      .from("orders")
      .insert({
        channel: "website",
        kind: "card_only",
        customer_name: "Short Payer",
        customer_email: BUYER,
        customer_phone: "+44 7700 900222",
        shipping_address: { line1: "1 Test St", city: "New York", state: "NY", zip: "10001" },
        carrier_id: await carrierId(),
        carrier_name: "E2E Mobile",
        product_type: "physical",
        quantity: 4,
        unit_price_cents: 0,
        sim_card_price_cents: 600,
        total_cents: 2500,
        status: "awaiting_payment",
        payment_status: "awaiting",
      })
      .select("public_token")
      .single()
    const page = await guestPage(browser)
    await page.goto(`/order/${open!.public_token}`)
    await expect(page.getByText("Pay to start your order")).toBeVisible()
    await expect(page.getByText("Send the exact amount the payment page shows")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/short-unpaid-phone.png`, fullPage: true })
    await page.emulateMedia({ colorScheme: "dark" })
    await page.screenshot({ path: `${SHOTS}/short-unpaid-phone-dark.png`, fullPage: true })
  })
})
