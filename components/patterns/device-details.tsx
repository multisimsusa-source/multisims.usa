"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { ActionResult } from "@/lib/admin/result"
import { checkDevice, deviceLabel, type DeviceField, type DeviceValues } from "@/lib/device"

export type DeviceSim = { id: string; title: string; values: DeviceValues }

/**
 * A buyer's phone details per SIM (IMEI, EID, SIM number), editable until the SIM is
 * delivered. One row per SIM, its own Save. The fields come from lib/device.ts for the plan.
 */
export function DeviceDetails({
  sims,
  fields,
  save,
}: {
  sims: DeviceSim[]
  fields: DeviceField[]
  save: (itemId: string, formData: FormData) => Promise<ActionResult>
}) {
  return (
    <ul className="divide-y">
      {sims.map((sim) => (
        <DeviceRow key={`${sim.id}-${fields.map((f) => sim.values[f] ?? "").join("-")}`} sim={sim} fields={fields} save={save} />
      ))}
    </ul>
  )
}

function DeviceRow({ sim, fields, save }: { sim: DeviceSim; fields: DeviceField[]; save: (itemId: string, formData: FormData) => Promise<ActionResult> }) {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [pending, start] = React.useTransition()

  return (
    <li>
      <form
        className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const found: Record<string, string> = {}
          for (const f of fields) {
            const problem = checkDevice(f, String(fd.get(f) ?? ""))
            if (problem) found[f] = problem
          }
          setErrors(found)
          if (Object.keys(found).length) return
          start(async () => {
            const result = await save(sim.id, fd)
            if (!result.ok) {
              setErrors(result.fieldErrors ?? {})
              toast.error(result.error)
              return
            }
            setDirty(false)
            toast.success(result.message ?? "Saved")
          })
        }}
      >
        <p className="text-sm font-medium">{sim.title}</p>
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          {fields.map((f) => {
            const id = `${sim.id}-${f}`
            return (
              <Field key={f} data-invalid={Boolean(errors[f]) || undefined} className={f === "eid" ? "sm:col-span-full" : undefined}>
                <FieldLabel htmlFor={id}>
                  {deviceLabel[f]}
                  <span className="sr-only">{`, ${sim.title}`}</span>
                </FieldLabel>
                <Input
                  id={id}
                  name={f}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={f === "eid" ? 40 : 24}
                  defaultValue={sim.values[f] ?? ""}
                  aria-invalid={Boolean(errors[f]) || undefined}
                  onChange={() => setDirty(true)}
                  className="tabular font-mono"
                />
                {errors[f] ? <FieldError>{errors[f]}</FieldError> : null}
              </Field>
            )
          })}
        </div>
        <div>
          <Button type="submit" size="lg" variant={dirty ? "default" : "outline"} disabled={pending || !dirty}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </li>
  )
}
