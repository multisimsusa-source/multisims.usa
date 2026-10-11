"use client"

import * as React from "react"
import { PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { centsToInput } from "@/lib/admin/result"
import type { Settings, TicketType } from "@/lib/types"
import { addTicketType, saveSettings, updateTicketType } from "./actions"

export function SettingsForm({ settings }: { settings: Settings }) {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [approval, setApproval] = React.useState(settings.replacement_needs_approval)
  const [pending, start] = React.useTransition()

  return (
    <form
      className="rounded-xl border bg-background"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set("replacement_needs_approval", approval ? "on" : "off")
        start(async () => {
          const result = await saveSettings(fd)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            return void toast.error(result.error)
          }
          setErrors({})
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
        <Field data-invalid={Boolean(errors.owner_email) || undefined}>
          <FieldLabel htmlFor="owner_email">Your alert email</FieldLabel>
          <Input id="owner_email" name="owner_email" type="email" defaultValue={settings.owner_email ?? ""} placeholder="you@example.com" />
          {errors.owner_email ? (
            <FieldError>{errors.owner_email}</FieldError>
          ) : (
            <FieldDescription>Unclaimed-order alerts, customer messages and new tickets go here.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.unclaimed_alert_minutes) || undefined}>
          <FieldLabel htmlFor="unclaimed_alert_minutes">Unclaimed alert after (minutes)</FieldLabel>
          <Input
            id="unclaimed_alert_minutes"
            name="unclaimed_alert_minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            defaultValue={settings.unclaimed_alert_minutes}
            className="font-mono tabular"
          />
          {errors.unclaimed_alert_minutes ? (
            <FieldError>{errors.unclaimed_alert_minutes}</FieldError>
          ) : (
            <FieldDescription>You get an email if no agent claims an order by then. The customer&apos;s contact button appears at the same time.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.shipping_fee) || undefined}>
          <FieldLabel htmlFor="shipping_fee">Shipping fee for SIM cards (USD)</FieldLabel>
          <Input id="shipping_fee" name="shipping_fee" inputMode="decimal" defaultValue={centsToInput(settings.shipping_fee_cents)} className="font-mono tabular" />
          {errors.shipping_fee ? (
            <FieldError>{errors.shipping_fee}</FieldError>
          ) : (
            <FieldDescription>
              Charged once per SIM card order. eSIMs never pay shipping.
              {settings.shipping_fee_cents === 0 ? " It is 0 now, so checkout shows Free shipping." : ""}
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.max_replacements_per_order) || undefined}>
          <FieldLabel htmlFor="max_replacements_per_order">Replacements per order (most)</FieldLabel>
          <Input
            id="max_replacements_per_order"
            name="max_replacements_per_order"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            defaultValue={settings.max_replacements_per_order}
            className="font-mono tabular"
          />
          {errors.max_replacements_per_order ? (
            <FieldError>{errors.max_replacements_per_order}</FieldError>
          ) : (
            <FieldDescription>Counts every free replacement on one order, for any of its SIMs. Cancelled ones do not count.</FieldDescription>
          )}
        </Field>
        <Field>
          <span className="text-sm font-medium">Replacement approval</span>
          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4 rounded-md border px-3 py-2">
            <span className="text-sm">Agents&apos; replacements wait for my approval</span>
            <Switch checked={approval} onCheckedChange={setApproval} aria-label="Replacements wait for my approval" />
          </label>
          <FieldDescription>Off: a replacement goes straight into the queue. Replacements you issue yourself never wait.</FieldDescription>
        </Field>
      </div>
      <div className="flex justify-end border-t p-4 sm:px-6">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </form>
  )
}

export function TicketTypes({ types }: { types: TicketType[] }) {
  const [name, setName] = React.useState("")
  const [pending, start] = React.useTransition()
  return (
    <div className="rounded-xl border bg-background">
      <ul className="divide-y">
        {types.map((t) => (
          <TicketTypeRow key={`${t.id}-${t.name}-${t.active}`} type={t} />
        ))}
      </ul>
      <form
        className="flex gap-2 border-t p-4"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const result = await addTicketType(name)
            if (!result.ok) return void toast.error(result.error)
            toast.success(result.message ?? "Added")
            setName("")
          })
        }}
      >
        <Input value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="New issue type" aria-label="New issue type" />
        <Button type="submit" size="lg" variant="outline" disabled={pending || name.trim().length < 2}>
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
      </form>
    </div>
  )
}

function TicketTypeRow({ type }: { type: TicketType }) {
  const [name, setName] = React.useState(type.name)
  const [active, setActive] = React.useState(type.active)
  const [pending, start] = React.useTransition()
  const save = (nextName: string, nextActive: boolean) =>
    start(async () => {
      const result = await updateTicketType(type.id, nextName, nextActive)
      if (!result.ok) {
        setName(type.name)
        setActive(type.active)
        return void toast.error(result.error)
      }
      toast.success(result.message ?? "Saved")
    })

  return (
    <li className="flex items-center gap-3 p-3 sm:px-4">
      <Input
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => name.trim() !== type.name && save(name, active)}
        aria-label="Issue type name"
        className="flex-1"
        disabled={pending}
      />
      <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <span className="max-sm:sr-only">{active ? "Shown" : "Hidden"}</span>
        <Switch
          checked={active}
          aria-label={`Show ${type.name} on the ticket form`}
          onCheckedChange={(next) => {
            setActive(next)
            save(name, next)
          }}
        />
      </label>
    </li>
  )
}
