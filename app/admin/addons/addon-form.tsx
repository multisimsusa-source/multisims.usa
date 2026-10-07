"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { centsToInput } from "@/lib/admin/result"
import type { Addon } from "@/lib/types"
import { updateAddon } from "./actions"

export function AddonForm({ addon }: { addon: Addon }) {
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [active, setActive] = React.useState(addon.active)

  return (
    <form
      className="rounded-xl border bg-background"
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        formData.set("active", active ? "on" : "off")
        startTransition(async () => {
          const result = await updateAddon(addon.id, formData)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            toast.error(result.error)
            return
          }
          setErrors({})
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b p-4 sm:p-6">
        <div>
          <h2 className="font-sans text-base font-semibold tracking-normal">{addon.name}</h2>
          <p className="font-mono text-xs text-muted-foreground">{addon.code}</p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          {active ? "Offered" : "Not offered"}
          <Switch checked={active} onCheckedChange={setActive} aria-label="Offer this add-on" />
        </label>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-6">
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor={`${addon.id}-name`}>Name</FieldLabel>
          <Input id={`${addon.id}-name`} name="name" defaultValue={addon.name} className="h-10" />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(errors.price) || undefined}>
            <FieldLabel htmlFor={`${addon.id}-price`}>Price (USD)</FieldLabel>
            <Input id={`${addon.id}-price`} name="price" inputMode="decimal" defaultValue={centsToInput(addon.price_cents)} className="h-10 font-mono tabular" />
            {errors.price ? <FieldError>{errors.price}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.wholesale_price) || undefined}>
            <FieldLabel htmlFor={`${addon.id}-wholesale`}>Wholesale</FieldLabel>
            <Input id={`${addon.id}-wholesale`} name="wholesale_price" inputMode="decimal" defaultValue={centsToInput(addon.wholesale_price_cents)} placeholder="Not set" className="h-10 font-mono tabular" />
            {errors.wholesale_price ? <FieldError>{errors.wholesale_price}</FieldError> : null}
          </Field>
        </div>
        <Field className="sm:col-span-2" data-invalid={Boolean(errors.description) || undefined}>
          <FieldLabel htmlFor={`${addon.id}-description`}>Description</FieldLabel>
          <Textarea id={`${addon.id}-description`} name="description" defaultValue={addon.description} rows={2} />
          {errors.description ? <FieldError>{errors.description}</FieldError> : <FieldDescription>Shown under the toggle on plan pages.</FieldDescription>}
        </Field>
      </div>
      <div className="flex justify-end border-t p-4 sm:px-6">
        <Button type="submit" size="lg" disabled={pending} className="h-10">
          {pending ? "Saving..." : "Save add-on"}
        </Button>
      </div>
    </form>
  )
}
