"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { answerTicket } from "@/app/agent/actions"
import { ticketStatusLabel } from "@/lib/orders"
import type { TicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const statuses: TicketStatus[] = ["open", "in_progress", "resolved"]

/** The one answer the customer sees on their order page (no chat thread), plus status. */
export function AnswerForm({
  ticketId,
  status,
  answer,
}: {
  ticketId: string
  status: TicketStatus
  answer: string | null
}) {
  const [value, setValue] = React.useState(answer ?? "")
  const [current, setCurrent] = React.useState<TicketStatus>(status)
  const [pending, start] = React.useTransition()
  const dirty = value.trim() !== (answer ?? "") || current !== status

  return (
    <form
      className="flex flex-col gap-5 rounded-xl border bg-background p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData()
        fd.set("status", current)
        fd.set("answer", value)
        start(async () => {
          const result = await answerTicket(ticketId, fd)
          if (result.ok) toast.success(result.message ?? "Saved")
          else toast.error(result.error)
        })
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <div className="grid grid-cols-3 gap-2">
          {statuses.map((s) => (
            <label
              key={s}
              className={cn(
                "flex min-h-10 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                current === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <input
                type="radio"
                name="status"
                value={s}
                checked={current === s}
                onChange={() => setCurrent(s)}
                className="sr-only"
              />
              {ticketStatusLabel[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field>
        <FieldLabel htmlFor="answer">Answer to the customer</FieldLabel>
        <Textarea
          id="answer"
          rows={6}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder="Restart the phone, then turn data roaming on under Cellular, SIM settings."
        />
        <FieldDescription>
          Shown on their order page and emailed to them when it changes. Plain
          text.
        </FieldDescription>
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-fit"
        disabled={pending || !dirty}
      >
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
