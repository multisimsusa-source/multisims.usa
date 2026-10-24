"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { requestBatchActivation } from "../actions"

/** SIM cards were posted; the dealer starts the lines once they have them in hand. */
export function ActivateCardsButton({ batchId }: { batchId: string }) {
  const [pending, start] = React.useTransition()
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <p className="font-semibold">Got the SIM cards?</p>
      <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
        Press this once the cards are in your hands. The plan days start from activation, so wait until they have arrived. It starts every card in this order.
      </p>
      <Button
        size="lg"
        className="mt-5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await requestBatchActivation(batchId)
            if (result.ok) toast.success(result.message ?? "Done")
            else toast.error(result.error)
          })
        }
      >
        {pending ? "Starting..." : "The cards arrived, activate them"}
      </Button>
    </div>
  )
}
