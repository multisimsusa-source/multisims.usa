/**
 * Removes all end-to-end test data from the LOCAL Supabase stack (test logins, their
 * dealers, wallets and orders, E2E carriers and discount codes). Refuses any other database.
 *   bun run e2e:cleanup
 */
import { cleanupTestData } from "../e2e/support/db"

const removed = await cleanupTestData()
console.log(`Removed ${removed.users} test logins, ${removed.dealers} dealers, ${removed.orders} orders, ${removed.carriers} carriers.`)
