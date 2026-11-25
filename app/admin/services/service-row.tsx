"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { centsToInput } from "@/lib/admin/result"
import { saveCarrierService } from "./actions"

/** One carrier's price for one service, saved with one button. */
export function ServiceRow({
  carrierId,
  carrierName,
  service,
  serviceName,
  price,
  wholesale,
  active,
  minimumCents,
}: {
  carrierId: string
  carrierName: string
  service: string
  serviceName: string
  price: number | null
  wholesale: number | null
  active: boolean
  minimumCents: number
}) {
  const [on, setOn] = React.useState(active)
  const [dirty, setDirty] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, start] = React.useTransition()
  const id = `${carrierId}-${service}`

  return (
    <form
      className="grid grid-cols-2 items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto_auto] sm:px-5"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set("active", on ? "on" : "off")
        start(async () => {
          const result = await saveCarrierService(carrierId, service, fd)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            return void toast.error(result.error)
          }
          setErrors({})
          setDirty(false)
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <p className="col-span-2 min-h-10 self-center font-medium sm:col-span-1">{carrierName}</p>
      <Field data-invalid={Boolean(errors.price) || undefined}>
        <FieldLabel htmlFor={`${id}-price`}>Customer price</FieldLabel>
        <Input
          id={`${id}-price`}
          name="price"
          inputMode="decimal"
          defaultValue={centsToInput(price)}
          onChange={() => setDirty(true)}
          className="tabular font-mono"
        />
        {errors.price ? (
          <FieldError>{errors.price}</FieldError>
        ) : on && price !== null && price < minimumCents ? (
          <p className="text-xs text-warning-ink">Under the website minimum: dealers only</p>
        ) : null}
      </Field>
      <Field data-invalid={Boolean(errors.wholesale_price) || undefined}>
        <FieldLabel htmlFor={`${id}-wholesale`}>Dealer price</FieldLabel>
        <Input
          id={`${id}-wholesale`}
          name="wholesale_price"
          inputMode="decimal"
          defaultValue={centsToInput(wholesale)}
          placeholder="None"
          onChange={() => setDirty(true)}
          className="tabular font-mono"
        />
        {errors.wholesale_price ? <FieldError>{errors.wholesale_price}</FieldError> : null}
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch
          checked={on}
          aria-label={`Offer ${serviceName} for ${carrierName}`}
          onCheckedChange={(checked) => {
            setOn(checked)
            setDirty(true)
          }}
        />
        <span>{on ? "Offered" : "Off"}</span>
      </label>
      <Button type="submit" size="lg" variant={dirty ? "default" : "outline"} disabled={pending || !dirty}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
