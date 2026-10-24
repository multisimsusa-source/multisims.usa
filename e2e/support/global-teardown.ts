import { cleanupTestData } from "./db"

/** Remove the test logins and everything the run created. Set E2E_KEEP=1 to inspect them. */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP === "1") return
  const removed = await cleanupTestData()
  console.log(`[e2e] cleaned up ${removed.users} test logins, ${removed.dealers} dealers, ${removed.orders} orders`)
}
