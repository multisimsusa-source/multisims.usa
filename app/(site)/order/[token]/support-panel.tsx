"use client"

import * as React from "react"
import { LifebuoyIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { TicketForm } from "./ticket-form"

/** The support form stays folded behind one button until the customer needs it. */
export function SupportPanel(props: React.ComponentProps<typeof TicketForm>) {
  const [open, setOpen] = React.useState(false)
  if (open) return <TicketForm {...props} />
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Something not working?</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Tell us what happens. We answer here and by email, and replace the line if it cannot be fixed.</p>
      </div>
      <Button type="button" variant="outline" size="lg" className="shrink-0" onClick={() => setOpen(true)}>
        <LifebuoyIcon data-icon="inline-start" />
        Report a problem
      </Button>
    </div>
  )
}
