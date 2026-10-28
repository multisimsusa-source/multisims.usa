"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { claimOrder } from "@/app/agent/actions"
import type { ActionResult } from "@/lib/admin/result"

/** Runs a server action from a button with a pending state and a toast for the result. */
export function ActionButton({
  action,
  children,
  pendingLabel,
  onDone,
  onFail,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<ActionResult>
  pendingLabel?: string
  onDone?: (result: Extract<ActionResult, { ok: true }>) => void
  onFail?: () => void
}) {
  const [pending, start] = React.useTransition()
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() =>
        start(async () => {
          const result = await action()
          if (!result.ok) {
            toast.error(result.error)
            onFail?.()
            return
          }
          if (result.message) toast.success(result.message)
          onDone?.(result)
        })
      }
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  )
}

/** Claim and go straight to the fulfilment screen. */
export function ClaimButton({
  orderId,
  className,
}: {
  orderId: string
  className?: string
}) {
  const router = useRouter()
  // The owner claims from admin screens and stays in admin; agents work in their portal.
  const base = usePathname().startsWith("/admin") ? "/admin" : "/agent"
  return (
    <ActionButton
      action={() => claimOrder(orderId)}
      pendingLabel="Claiming..."
      size="lg"
      className={className}
      onDone={() => router.push(`${base}/orders/${orderId}`)}
      // Someone else was quicker: show the order as it is now, with who holds it.
      onFail={() => router.refresh()}
    >
      Claim
    </ActionButton>
  )
}
