"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { ActionResult } from "@/lib/admin/result"

/** A confirm step that also collects a short note (reason, refund details, instruction). */
export function NoteDialog({
  trigger,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  destructive,
  required,
  children,
  action,
}: {
  trigger: React.ReactElement
  title: string
  description: React.ReactNode
  label: string
  placeholder?: string
  confirmLabel: string
  destructive?: boolean
  required?: boolean
  /** Extra fields above the note (for example who to reassign to). */
  children?: React.ReactNode
  action: (note: string) => Promise<ActionResult>
}) {
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [pending, start] = React.useTransition()
  const id = React.useId()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const result = await action(note)
              if (!result.ok) {
                toast.error(result.error)
                return
              }
              toast.success(result.message ?? "Done")
              setNote("")
              setOpen(false)
            })
          }}
        >
          {children}
          <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder={placeholder} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              variant={destructive ? "destructive" : "default"}
             
              disabled={pending || (required && note.trim().length < 3)}
            >
              {pending ? "Working..." : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
