"use client"

import * as React from "react"
import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ConfirmAction } from "@/components/admin/confirm-action"
import { cn } from "@/lib/utils"
import { createDiscountCode, deleteDiscountCode, setDiscountActive } from "./actions"

const ANY = "any"

export function NewDiscountButton({ carriers }: { carriers: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<"percent" | "fixed">("percent")
  const [carrier, setCarrier] = React.useState(ANY)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, start] = React.useTransition()
  const id = React.useId()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setErrors({})
          setKind("percent")
          setCarrier(ANY)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="lg">
            <PlusIcon weight="bold" data-icon="inline-start" />
            New code
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New discount code</DialogTitle>
          <DialogDescription>For website orders. It comes off the plan, calling and SIM cards, never shipping or the network fee.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            fd.set("kind", kind)
            fd.set("carrier_id", carrier === ANY ? "" : carrier)
            start(async () => {
              const result = await createDiscountCode(fd)
              if (!result.ok) {
                setErrors(result.fieldErrors ?? {})
                return void toast.error(result.error)
              }
              toast.success(result.message ?? "Saved")
              setOpen(false)
            })
          }}
        >
          <Field data-invalid={Boolean(errors.code) || undefined}>
            <FieldLabel htmlFor={`${id}-code`}>Code</FieldLabel>
            <Input id={`${id}-code`} name="code" autoComplete="off" spellCheck={false} className="font-mono uppercase" />
            {errors.code ? <FieldError>{errors.code}</FieldError> : <FieldDescription>What customers type, for example WELCOME10. Case does not matter.</FieldDescription>}
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Takes off</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["percent", "A percent"],
                  ["fixed", "An amount"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    kind === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <input type="radio" name="kind-choice" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field data-invalid={Boolean(errors.value) || undefined}>
            <FieldLabel htmlFor={`${id}-value`}>{kind === "percent" ? "Percent off" : "Amount off (USD)"}</FieldLabel>
            <Input id={`${id}-value`} name="value" inputMode={kind === "percent" ? "numeric" : "decimal"} autoComplete="off" className="font-mono tabular" />
            {errors.value ? <FieldError>{errors.value}</FieldError> : <FieldDescription>{kind === "percent" ? "1 to 90, for example 10" : "For example 5.00"}</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-carrier`}>Carrier</FieldLabel>
            <Select items={[{ value: ANY, label: "Any carrier" }, ...carriers.map((c) => ({ value: c.id, label: c.name }))]} value={carrier} onValueChange={(v) => setCarrier(String(v ?? ANY))}>
              <SelectTrigger id={`${id}-carrier`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any carrier</SelectItem>
                {carriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.starts_on) || undefined}>
              <FieldLabel htmlFor={`${id}-starts`}>
                Starts <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id={`${id}-starts`} name="starts_on" type="date" />
              {errors.starts_on ? <FieldError>{errors.starts_on}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.ends_on) || undefined}>
              <FieldLabel htmlFor={`${id}-ends`}>
                Last day <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id={`${id}-ends`} name="ends_on" type="date" />
              {errors.ends_on ? <FieldError>{errors.ends_on}</FieldError> : null}
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.max_uses) || undefined}>
            <FieldLabel htmlFor={`${id}-uses`}>
              Most uses <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id={`${id}-uses`} name="max_uses" type="number" inputMode="numeric" min={1} className="font-mono tabular" />
            {errors.max_uses ? <FieldError>{errors.max_uses}</FieldError> : <FieldDescription>Counted when an order is paid. Empty for no limit.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>
              Private note <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id={`${id}-note`} name="note" maxLength={200} autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving..." : "Create code"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DiscountActiveSwitch({ id, code, active }: { id: string; code: string; active: boolean }) {
  const [on, setOn] = React.useState(active)
  const [pending, start] = React.useTransition()
  return (
    <Switch
      checked={on}
      disabled={pending}
      aria-label={`${code} can be used`}
      onCheckedChange={(next) => {
        setOn(next)
        start(async () => {
          const result = await setDiscountActive(id, next)
          if (!result.ok) {
            setOn(!next)
            toast.error(result.error)
          } else toast.success(result.message ?? "Saved")
        })
      }}
    />
  )
}

export function DeleteDiscountButton({ id, code }: { id: string; code: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${code}`} className="size-10">
          <TrashIcon className="size-4" />
        </Button>
      }
      title={`Remove ${code}?`}
      description="Customers can no longer use it. This cannot be undone."
      confirmLabel="Remove code"
      action={() => deleteDiscountCode(id)}
    />
  )
}
