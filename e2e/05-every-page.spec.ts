import { expect, test, type Page } from "@playwright/test"

import { db } from "./support/db"
import { DEALER_A, DOMAIN } from "./support/env"
import { DESKTOP, expectNoHorizontalScroll, guestPage, pageAs, PHONE, signIn } from "./support/helpers"

/**
 * Every screen, for every role, on a phone and a desktop, in light and dark: it loads, it
 * has its heading, nothing scrolls sideways, and no script error is thrown (any page error
 * fails the test). Runs last, over the data the earlier files created.
 */

async function ids() {
  const client = db()
  const [{ data: order }, { data: ticket }, { data: dealer }, { data: plan }, { data: batch }] = await Promise.all([
    client.from("orders").select("id, public_token").eq("customer_email", `e2e-esim@${DOMAIN}`).is("replacement_of", null).single(),
    client.from("tickets").select("id").limit(1).single(),
    client.from("profiles").select("id").eq("email", DEALER_A).single(),
    client.from("plans").select("id, slug").eq("name", "E2E Unlimited").single(),
    client.from("order_batches").select("id").eq("reference", "PO E2E-1").single(),
  ])
  return { order: order!, ticket: ticket!, dealer: dealer!, plan: plan!, batch: batch! }
}

async function sweep(page: Page, paths: string[]) {
  for (const path of paths) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBeLessThan(400)
    await expect(page.locator("h1").filter({ visible: true }).first(), path).toBeVisible()
    await expectNoHorizontalScroll(page)
  }
}

for (const scheme of ["light", "dark"] as const) {
  for (const [label, viewport] of [
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ] as const) {
    test.describe(`Every page, ${label}, ${scheme}`, () => {
      test.use({ colorScheme: scheme })

      test("public website", async ({ browser }) => {
        const { order, plan } = await ids()
        const page = await guestPage(browser, viewport)
        await page.emulateMedia({ colorScheme: scheme })
        await sweep(page, ["/", "/plans", `/plans/${plan.slug}`, "/about", "/faq", "/contact", `/checkout?plan=${plan.slug}&days=7`, "/terms", "/refund-policy", `/order/${order.public_token}`, "/portal/login"])
      })

      test("owner portal", async ({ browser }) => {
        const { order, ticket, dealer, plan } = await ids()
        const page = await pageAs(browser, "owner", viewport)
        await page.emulateMedia({ colorScheme: scheme })
        await sweep(page, [
          "/admin",
          "/admin/reports",
          "/admin/orders",
          `/admin/orders/${order.id}`,
          "/admin/tickets",
          `/admin/tickets/${ticket.id}`,
          "/admin/activations",
          "/admin/customers",
          "/admin/reviews",
          "/admin/carriers",
          "/admin/plans",
          `/admin/plans/${plan.id}`,
          "/admin/plans/new",
          "/admin/addons",
          "/admin/discounts",
          "/admin/agents",
          "/admin/dealers",
          `/admin/dealers/${dealer.id}`,
          "/admin/settings",
          "/admin/design",
        ])
      })

      test("agent portal", async ({ browser }) => {
        const { order, ticket } = await ids()
        const page = await pageAs(browser, "agent", viewport)
        await page.emulateMedia({ colorScheme: scheme })
        await sweep(page, ["/agent", "/agent/orders", `/agent/orders/${order.id}`, "/agent/tickets", `/agent/tickets/${ticket.id}`])
      })

      test("dealer portal", async ({ browser }) => {
        const { batch } = await ids()
        const page = await signIn(browser, DEALER_A, viewport)
        await page.emulateMedia({ colorScheme: scheme })
        await sweep(page, ["/dealer", "/dealer/new", "/dealer/orders", `/dealer/orders/${batch.id}`, "/dealer/activations", "/dealer/tickets", "/dealer/wallet", "/dealer/account"])
      })
    })
  }
}
