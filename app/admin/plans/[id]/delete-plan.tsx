"use client"

import { TrashIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/admin/confirm-action"
import { deletePlan } from "../actions"

export function DeletePlan({ id, name }: { id: string; name: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h2 className="font-sans text-base font-semibold tracking-normal">Delete plan</h2>
        <p className="text-sm text-muted-foreground">Removes the plan and its day packages for good. To pause sales, withdraw it instead.</p>
      </div>
      <ConfirmAction
        trigger={
          <Button variant="destructive" size="lg">
            <TrashIcon data-icon="inline-start" />
            Delete plan
          </Button>
        }
        title={`Delete ${name}?`}
        description="This cannot be undone. The plan page stops working straight away."
        confirmLabel="Delete plan"
        action={() => deletePlan(id)}
      />
    </section>
  )
}
