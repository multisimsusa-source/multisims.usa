"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Carrier, Plan } from "@/lib/types"
import { cn } from "@/lib/utils"
import { createPlan, updatePlan } from "./actions"

type Props = {
  carriers: Pick<Carrier, "id" | "name" | "slug">[]
  plan?: Plan
  defaultCarrierId?: string
}

export function PlanForm({ carriers, plan, defaultCarrierId }: Props) {
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [unlimited, setUnlimited] = React.useState(plan ? plan.data_gb === null : true)
  const [published, setPublished] = React.useState(plan?.published ?? false)
  const [carrierId, setCarrierId] = React.useState(plan?.carrier_id ?? defaultCarrierId ?? carriers[0]?.id ?? "")

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("data_unlimited", unlimited ? "on" : "off")
    formData.set("published", published ? "on" : "off")
    formData.set("carrier_id", carrierId)
    formData.set("carrier_slug", carriers.find((c) => c.id === carrierId)?.slug ?? "")
    startTransition(async () => {
      const result = plan ? await updatePlan(plan.id, formData) : await createPlan(formData)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      setErrors({})
      toast.success(result.message ?? "Saved")
    })
  }

  const err = (key: string) => (errors[key] ? <FieldError>{errors[key]}</FieldError> : null)
  const invalid = (key: string) => Boolean(errors[key]) || undefined

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Section title="Basics">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={invalid("carrier_id")}>
            <FieldLabel htmlFor="carrier_id">Carrier</FieldLabel>
            <Select
              name="carrier_id"
              items={carriers.map((c) => ({ value: c.id, label: c.name }))}
              value={carrierId}
              onValueChange={(v) => setCarrierId(String(v ?? ""))}
            >
              <SelectTrigger id="carrier_id" aria-invalid={invalid("carrier_id")} className="h-10 w-full">
                <SelectValue placeholder="Choose a carrier" />
              </SelectTrigger>
              <SelectContent>
                {carriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("carrier_id")}
          </Field>

          <Field data-invalid={invalid("product_type")}>
            <FieldLabel id="product_type_label">Product</FieldLabel>
            <div role="radiogroup" aria-labelledby="product_type_label" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["esim", "eSIM"],
                  ["physical", "SIM card"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
                >
                  <input
                    type="radio"
                    name="product_type"
                    value={value}
                    defaultChecked={(plan?.product_type ?? "esim") === value}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
            {err("product_type")}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={invalid("name")}>
            <FieldLabel htmlFor="name">Plan name</FieldLabel>
            <Input id="name" name="name" defaultValue={plan?.name} placeholder="Unlimited Plus" className="h-10" aria-invalid={invalid("name")} />
            {err("name")}
          </Field>
          <Field data-invalid={invalid("slug")}>
            <FieldLabel htmlFor="slug">URL name</FieldLabel>
            <Input id="slug" name="slug" defaultValue={plan?.slug} placeholder="Made from carrier and name if empty" className="h-10 font-mono text-sm" aria-invalid={invalid("slug")} />
            {errors.slug ? err("slug") : <FieldDescription>The plan page lives at /plans/this-name</FieldDescription>}
          </Field>
        </div>

        <Field data-invalid={invalid("summary")}>
          <FieldLabel htmlFor="summary">Short summary</FieldLabel>
          <Input id="summary" name="summary" defaultValue={plan?.summary} maxLength={200} placeholder="Unlimited data on T-Mobile 5G with 10 GB hotspot." className="h-10" aria-invalid={invalid("summary")} />
          {errors.summary ? err("summary") : <FieldDescription>One line, shown on plan cards and in search results.</FieldDescription>}
        </Field>
      </Section>

      <Section title="Plan details">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={invalid("talk")}>
            <FieldLabel htmlFor="talk">Talk</FieldLabel>
            <Input id="talk" name="talk" defaultValue={plan?.talk ?? "Unlimited US talk"} className="h-10" aria-invalid={invalid("talk")} />
            {err("talk")}
          </Field>
          <Field data-invalid={invalid("sms")}>
            <FieldLabel htmlFor="sms">Text</FieldLabel>
            <Input id="sms" name="sms" defaultValue={plan?.sms ?? "Unlimited US text"} className="h-10" aria-invalid={invalid("sms")} />
            {err("sms")}
          </Field>

          <Field data-invalid={invalid("data_gb")}>
            <FieldLabel htmlFor="data_gb">Data allowance (GB)</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="data_gb"
                name="data_gb"
                inputMode="decimal"
                defaultValue={plan?.data_gb ?? ""}
                disabled={unlimited}
                placeholder={unlimited ? "Unlimited" : "20"}
                className="h-10"
                aria-invalid={invalid("data_gb")}
              />
              <label className="flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm">
                <Switch size="sm" checked={unlimited} onCheckedChange={setUnlimited} aria-label="Unlimited data" />
                Unlimited
              </label>
            </div>
            {err("data_gb")}
          </Field>
          <Field data-invalid={invalid("hotspot_gb")}>
            <FieldLabel htmlFor="hotspot_gb">Hotspot (GB)</FieldLabel>
            <Input id="hotspot_gb" name="hotspot_gb" inputMode="decimal" defaultValue={plan?.hotspot_gb ?? ""} placeholder="Empty means no hotspot" className="h-10" aria-invalid={invalid("hotspot_gb")} />
            {err("hotspot_gb")}
          </Field>

          <Field data-invalid={invalid("network")}>
            <FieldLabel htmlFor="network">Network and speed</FieldLabel>
            <Input id="network" name="network" defaultValue={plan?.network ?? "5G / 4G LTE"} className="h-10" aria-invalid={invalid("network")} />
            {err("network")}
          </Field>
          <Field data-invalid={invalid("countries_covered")}>
            <FieldLabel htmlFor="countries_covered">Countries covered</FieldLabel>
            <Input
              id="countries_covered"
              name="countries_covered"
              defaultValue={(plan?.countries_covered ?? ["United States"]).join(", ")}
              className="h-10"
              aria-invalid={invalid("countries_covered")}
            />
            {errors.countries_covered ? err("countries_covered") : <FieldDescription>Separate with commas</FieldDescription>}
          </Field>

          <Field data-invalid={invalid("slowdown_after_gb")}>
            <FieldLabel htmlFor="slowdown_after_gb">Slows down after (GB)</FieldLabel>
            <Input id="slowdown_after_gb" name="slowdown_after_gb" inputMode="decimal" defaultValue={plan?.slowdown_after_gb ?? ""} placeholder="Empty means no slowdown" className="h-10" aria-invalid={invalid("slowdown_after_gb")} />
            {err("slowdown_after_gb")}
          </Field>
          <Field data-invalid={invalid("slowdown_speed")}>
            <FieldLabel htmlFor="slowdown_speed">Speed after slowdown</FieldLabel>
            <Input id="slowdown_speed" name="slowdown_speed" defaultValue={plan?.slowdown_speed ?? ""} placeholder="1.5 Mbps" className="h-10" aria-invalid={invalid("slowdown_speed")} />
            {err("slowdown_speed")}
          </Field>
        </div>
      </Section>

      <Section title="Description">
        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="description" className="sr-only">
            Description
          </FieldLabel>
          <Textarea id="description" name="description" defaultValue={plan?.description} rows={7} className="min-h-40" aria-invalid={invalid("description")} />
          {errors.description ? err("description") : <FieldDescription>Plain text. Leave a blank line between paragraphs.</FieldDescription>}
        </Field>
      </Section>

      <div
        className={cn(
          "sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-canvas/95 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border sm:bg-background/95 sm:px-5"
        )}
      >
        {plan ? (
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={published} onCheckedChange={setPublished} aria-label="Published" />
            <span>
              <span className="font-medium">{published ? "Published" : "Withdrawn"}</span>
              <span className="block text-xs text-muted-foreground">Saved with the plan</span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">Next you will add day packages, then publish.</p>
        )}
        <Button type="submit" size="lg" disabled={pending} className="h-11 sm:px-6">
          {pending ? "Saving..." : plan ? "Save plan" : "Create plan"}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-background p-4 sm:p-6">
      <h2 className="mb-5 font-sans text-base font-semibold tracking-normal">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}
