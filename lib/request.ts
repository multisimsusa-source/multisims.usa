import "server-only"

import { headers } from "next/headers"

/** The caller's IP for rate limiting (Vercel sets x-forwarded-for). */
export async function clientIp() {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}
