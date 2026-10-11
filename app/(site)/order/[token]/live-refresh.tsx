"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

/**
 * Re-renders the order page from the server every 15 seconds while it is processing,
 * and straight away when the tab comes back into view, so a delivered QR code appears
 * without a manual reload. Customers have no Realtime access by design.
 */
export function LiveRefresh({ active, intervalMs = 15_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter()

  React.useEffect(() => {
    if (!active) return
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [active, intervalMs, router])

  return null
}
