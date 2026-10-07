"use client"

import * as React from "react"
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { publicStorageUrl } from "@/lib/supabase/env"
import type { Carrier } from "@/lib/types"
import { createCarrier, updateCarrier } from "./actions"

type Props = { mode: "create" } | { mode: "edit"; carrier: Carrier }

export function CarrierDialog(props: Props) {
  const carrier = props.mode === "edit" ? props.carrier : null
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [active, setActive] = React.useState(carrier?.active ?? true)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("active", active ? "on" : "off")
    startTransition(async () => {
      const result = carrier ? await updateCarrier(carrier.id, formData) : await createCarrier(formData)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      setErrors({})
      toast.success(result.message ?? "Saved")
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setErrors({})
          setActive(carrier?.active ?? true)
        }
      }}
    >
      <DialogTrigger
        render={
          carrier ? (
            <Button variant="ghost" size="icon" aria-label={`Edit ${carrier.name}`}>
              <PencilSimpleIcon className="size-4" />
            </Button>
          ) : (
            <Button size="lg" className="h-10">
              <PlusIcon weight="bold" data-icon="inline-start" />
              Add carrier
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-5" encType="multipart/form-data">
          <DialogHeader>
            <DialogTitle>{carrier ? `Edit ${carrier.name}` : "Add carrier"}</DialogTitle>
            <DialogDescription>
              {carrier ? "Changes show on the website straight away." : "The carrier joins the logo strip once it has a published plan."}
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="carrier-name">Name</FieldLabel>
            <Input id="carrier-name" name="name" required defaultValue={carrier?.name} placeholder="T-Mobile" className="h-10" />
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </Field>

          <Field data-invalid={Boolean(errors.slug) || undefined}>
            <FieldLabel htmlFor="carrier-slug">URL name</FieldLabel>
            <Input id="carrier-slug" name="slug" defaultValue={carrier?.slug} placeholder="Made from the name if empty" className="h-10 font-mono text-sm" />
            {errors.slug ? <FieldError>{errors.slug}</FieldError> : <FieldDescription>Used in links such as /plans?carrier=t-mobile</FieldDescription>}
          </Field>

          <Field data-invalid={Boolean(errors.logo) || undefined}>
            <FieldLabel htmlFor="carrier-logo">Logo</FieldLabel>
            {carrier?.logo_path ? (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicStorageUrl("carrier-logos", carrier.logo_path)} alt="" className="h-7 w-auto max-w-40 object-contain" />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" name="remove_logo" className="size-4 accent-foreground" />
                  Remove
                </label>
              </div>
            ) : null}
            <Input id="carrier-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="h-10 pt-2 text-sm" />
            {errors.logo ? <FieldError>{errors.logo}</FieldError> : <FieldDescription>PNG, JPG or WebP, up to 1 MB. A wide logo on a transparent background works best.</FieldDescription>}
          </Field>

          <Field>
            <FieldLabel>Fulfilment</FieldLabel>
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
              <span>Manual, by agents</span>
              <span className="text-xs text-muted-foreground">Carrier API: later phase</span>
            </div>
          </Field>

          <label htmlFor="carrier-active" className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
            <span>
              <span className="block text-sm font-medium">Show on website</span>
              <span className="block text-xs text-muted-foreground">Off hides the carrier and all its plans</span>
            </span>
            <Switch id="carrier-active" checked={active} onCheckedChange={setActive} />
          </label>

          <DialogFooter>
            <Button type="submit" size="lg" disabled={pending} className="h-10">
              {pending ? "Saving..." : carrier ? "Save carrier" : "Add carrier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
