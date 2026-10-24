"use client"

import * as React from "react"
import { LifebuoyIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { TicketForm } from "@/components/site/ticket-form"
import type { FormState } from "@/lib/form-state"

/** "Report a problem" under one line of a dealer's order; the form unfolds in place. */
export function LineSupport({
  submit,
  orderLabel,
  types,
  items,
}: {
  submit: (prev: FormState, formData: FormData) => Promise<FormState>
  orderLabel: string
  types: { id: string; name: string }[]
  items: { id: string; label: string }[]
}) {
  const [open, setOpen] = React.useState(false)
  if (open) {
    return (
      <div className="border-t p-4 sm:p-5">
        <TicketForm bare submit={submit} orderLabel={orderLabel} types={types} items={items} turnstile={false} successHint="The answer shows under Tickets, and we email you when it changes." />
      </div>
    )
  }
  return (
    <div className="flex justify-end border-t px-4 py-3 sm:px-5">
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <LifebuoyIcon data-icon="inline-start" />
        Report a problem
      </Button>
    </div>
  )
}
