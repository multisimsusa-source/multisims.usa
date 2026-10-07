"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { ActionResult } from "@/lib/admin/result"

type Props = {
  trigger: React.ReactElement
  title: string
  description: React.ReactNode
  confirmLabel: string
  action: () => Promise<ActionResult | void>
}

/** Destructive confirmation. The trigger is rendered as the dialog's trigger element. */
export function ConfirmAction({ trigger, title, description, confirmLabel, action }: Props) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action()
                if (result && !result.ok) {
                  toast.error(result.error)
                  return
                }
                if (result?.message) toast.success(result.message)
                setOpen(false)
              })
            }
          >
            {pending ? "Working..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
