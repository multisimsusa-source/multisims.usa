"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

/**
 * The toast for an action that ended in a redirect (create, delete): `?created=1` on the new
 * page shows "Plan created" once, then the marker leaves the URL so a reload does not repeat it.
 * Render inside Suspense (it reads the search params).
 */
export function FlashToast({ messages }: { messages: Record<string, string> }) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const key = Object.keys(messages).find((k) => params.get(k) === "1")

  React.useEffect(() => {
    if (!key) return
    // One toast however often the effect runs before the marker is gone.
    toast.success(messages[key], { id: `flash-${key}` })
    const rest = new URLSearchParams(params)
    rest.delete(key)
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false })
  }, [key, messages, params, pathname, router])

  return null
}
