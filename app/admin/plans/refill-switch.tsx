"use client"

import * as React from "react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { setPlanRefillable } from "./actions"

/** "Offer for refills", saved as soon as it is switched (plan page, Refills page). */
export function RefillSwitch({ id, name, refillable }: { id: string; name: string; refillable: boolean }) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Switch
      checked={refillable}
      disabled={pending}
      aria-label={`Offer ${name} for refills`}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          const result = await setPlanRefillable(id, checked)
          if (result.ok) toast.success(result.message ?? "Saved")
          else toast.error(result.error)
        })
      }
    />
  )
}
