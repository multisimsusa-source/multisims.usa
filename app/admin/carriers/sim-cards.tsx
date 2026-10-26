"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { centsToInput } from "@/lib/admin/result"
import { saveSimCard } from "./actions"

export type AdminSimCard = {
  carrier_id: string
  carrier_name: string
  price_cents: number | null
  wholesale_price_cents: number | null
  active: boolean
}

/**
 * One row per carrier: its SIM card's retail price, the default dealer price and whether
 * the card is sold on its own. Plans with SIM cards always charge the card price.
 */
export function SimCardPrices({ cards }: { cards: AdminSimCard[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {cards.map((card) => (
        <li key={card.carrier_id}>
          <SimCardRow card={card} />
        </li>
      ))}
    </ul>
  )
}

function SimCardRow({ card }: { card: AdminSimCard }) {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [active, setActive] = React.useState(card.active)
  const [pending, start] = React.useTransition()
  const id = React.useId()
  return (
    <form
      className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto_auto] sm:items-end sm:px-5"
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const result = await saveSimCard(card.carrier_id, fd)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            toast.error(result.error)
            return
          }
          setErrors({})
          setDirty(false)
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <p className="font-medium sm:pb-2.5">{card.carrier_name} SIM card</p>
      <Field data-invalid={Boolean(errors.price) || undefined}>
        <FieldLabel htmlFor={`${id}-price`}>Price (USD)</FieldLabel>
        <Input
          id={`${id}-price`}
          name="price"
          inputMode="decimal"
          defaultValue={centsToInput(card.price_cents)}
          aria-invalid={Boolean(errors.price) || undefined}
          className="tabular font-mono"
        />
        {errors.price ? <FieldError>{errors.price}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(errors.wholesale) || undefined}>
        <FieldLabel htmlFor={`${id}-wholesale`}>Dealers (USD)</FieldLabel>
        <Input
          id={`${id}-wholesale`}
          name="wholesale"
          inputMode="decimal"
          defaultValue={centsToInput(card.wholesale_price_cents)}
          aria-invalid={Boolean(errors.wholesale) || undefined}
          className="tabular font-mono"
        />
        {errors.wholesale ? <FieldError>{errors.wholesale}</FieldError> : null}
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
        <input type="hidden" name="active" value={active ? "on" : "off"} />
        <Switch
          checked={active}
          aria-label={`Sell the ${card.carrier_name} SIM card on its own`}
          onCheckedChange={(next) => {
            setActive(next)
            setDirty(true)
          }}
        />
        <span className={active ? "w-14" : "w-14 text-muted-foreground"}>{active ? "On sale" : "Off"}</span>
      </label>
      <Button type="submit" size="lg" variant={dirty ? "default" : "outline"} disabled={pending || !dirty}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
