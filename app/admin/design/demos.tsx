"use client"

import * as React from "react"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { QuantityStepper } from "@/components/patterns/quantity-stepper"

const states = [
  { value: "NY", label: "New York" },
  { value: "CA", label: "California" },
  { value: "FL", label: "Florida" },
]

export function DemoSelect() {
  const [value, setValue] = React.useState<string | null>("NY")
  return (
    <Select items={states} value={value} onValueChange={(v) => setValue(v as string | null)}>
      <SelectTrigger aria-label="State example" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {states.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DemoSwitch() {
  const [on, setOn] = React.useState(true)
  return (
    <label className="ml-auto flex items-center gap-2 text-sm">
      {on ? "On" : "Off"}
      <Switch checked={on} onCheckedChange={setOn} aria-label="Example switch" />
    </label>
  )
}

export function DemoFormSection() {
  return (
    <FormCard className="[--control-h:2.75rem]">
      <FormSection title="Contact" description="Your order link and updates go to this email.">
        <Field>
          <FieldLabel htmlFor="demo-name">Full name</FieldLabel>
          <Input id="demo-name" />
        </Field>
        <Field>
          <FieldLabel htmlFor="demo-email">Email</FieldLabel>
          <Input id="demo-email" type="email" />
        </Field>
        <Field className="sm:col-span-full">
          <FieldLabel htmlFor="demo-phone">Phone or WhatsApp</FieldLabel>
          <Input id="demo-phone" type="tel" />
          <FieldDescription>With country code, for example +94 77 123 4567.</FieldDescription>
        </Field>
      </FormSection>
      <FormSection title="Delivery address" description="Three columns for City, State, ZIP." cols={3}>
        <Field className="sm:col-span-full">
          <FieldLabel htmlFor="demo-street">Street address</FieldLabel>
          <Input id="demo-street" />
        </Field>
        <Field>
          <FieldLabel htmlFor="demo-city">City</FieldLabel>
          <Input id="demo-city" />
        </Field>
        <Field>
          <FieldLabel>State</FieldLabel>
          <DemoSelect />
        </Field>
        <Field>
          <FieldLabel htmlFor="demo-zip">ZIP code</FieldLabel>
          <Input id="demo-zip" />
        </Field>
      </FormSection>
    </FormCard>
  )
}

export function DemoQuantityStepper() {
  const [a, setA] = React.useState(2)
  const [b, setB] = React.useState(100)
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-3">
        <span id="demo-qty" className="text-sm text-muted-foreground">
          Checkout (read out)
        </span>
        <QuantityStepper value={a} onChange={setA} max={10} labelledBy="demo-qty" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Dealer (typed)</span>
        <QuantityStepper value={b} onChange={setB} max={500} label="Number of SIMs" editable />
      </div>
    </div>
  )
}
