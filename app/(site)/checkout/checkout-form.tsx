"use client"

import * as React from "react"
import Link from "next/link"
import {
  LockSimpleIcon,
  MinusIcon,
  PhoneIcon,
  PlusIcon,
  SpinnerIcon,
} from "@phosphor-icons/react"

import { ActionBar } from "@/components/patterns/action-bar"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { Notice } from "@/components/patterns/notice"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ProductBadge } from "@/components/site/product-mark"
import { formatDays, formatPrice } from "@/lib/format"
import { MAX_QUANTITY } from "@/lib/orders"
import type { ProductType } from "@/lib/types"
import { usStates } from "@/lib/us-states"
import { placeOrder, type CheckoutField, type CheckoutState } from "./actions"

type Props = {
  plan: {
    slug: string
    name: string
    carrierName: string
    productType: ProductType
  }
  /** The carrier logo, rendered on the server. */
  logo: React.ReactNode
  /** One line of the plan's key facts, e.g. "20 GB data, 10 GB hotspot". */
  facts: string
  days: number
  unitCents: number
  addon: { name: string; description: string; price_cents: number } | null
  initialIntl: boolean
  shippingCents: number
}

/**
 * Checkout. Phones: the order card first, then the details form, with the total and
 * Place order held at the bottom of the screen while the form is in view. Desktop: form left, a sticky order
 * summary right with the button and what happens next.
 */
export function CheckoutForm({
  plan,
  logo,
  facts,
  days,
  unitCents,
  addon,
  initialIntl,
  shippingCents,
}: Props) {
  const [state, action, pending] = React.useActionState<
    CheckoutState,
    FormData
  >(placeOrder, { status: "idle" })
  const values = state.values ?? {}
  const errors = state.fieldErrors ?? {}
  const physical = plan.productType === "physical"
  const formRef = React.useRef<HTMLFormElement>(null)

  const [quantity, setQuantity] = React.useState(() =>
    clamp(Number(values.quantity) || 1)
  )
  const [intl, setIntl] = React.useState(
    values.intl ? values.intl === "on" : initialIntl
  )
  const [stateCode, setStateCode] = React.useState(values.state ?? "")

  const lineCents = unitCents + (intl && addon ? addon.price_cents : 0)
  const shipping = physical ? shippingCents : 0
  const total = lineCents * quantity + shipping
  const unit = physical ? "SIM card" : "eSIM"

  // After a failed submit, bring the first problem into view and focus it.
  React.useEffect(() => {
    if (state.status !== "error") return
    const first = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]'
    )
    const target =
      first ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]')
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    first?.focus({ preventScroll: true })
  }, [state])

  const err = (name: CheckoutField) =>
    errors[name] ? <FieldError>{errors[name]}</FieldError> : null
  const invalid = (name: CheckoutField) => Boolean(errors[name]) || undefined

  const alert =
    state.status === "error" && state.message ? (
      <Notice tone="danger" icon={false}>
        {state.message}
      </Notice>
    ) : null

  const submitLabel = pending ? (
    <>
      <SpinnerIcon className="animate-spin" />
      Placing order...
    </>
  ) : (
    "Place order"
  )

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-10"
    >
      <input type="hidden" name="plan" value={plan.slug} />
      <input type="hidden" name="days" value={days} />
      <input type="hidden" name="quantity" value={quantity} />
      {addon ? (
        <input type="hidden" name="intl" value={intl ? "on" : "off"} />
      ) : null}

      {/* Order summary: top on phones, sticky right rail on desktop. */}
      <aside aria-label="Your order" className="lg:sticky lg:top-24 lg:order-2">
        <div className="rounded-xl border bg-card">
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-6 items-center">{logo}</span>
              <ProductBadge type={plan.productType} />
            </div>
            <p className="mt-4 font-heading text-xl font-semibold tracking-[-0.02em]">
              {plan.name}
            </p>
            {facts ? (
              <p className="mt-1 text-sm text-muted-foreground">{facts}</p>
            ) : null}
            <p className="mt-3 flex items-center gap-2 text-sm">
              <span className="font-medium">{formatDays(days)}</span>
              <span aria-hidden className="text-border">
                |
              </span>
              <Link
                href={`/plans/${plan.slug}`}
                className="inline-flex min-h-6 items-center text-brand underline-offset-4 hover:underline"
              >
                Change
              </Link>
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 border-t px-5 py-4">
            <div>
              <p id="qty-label" className="text-sm font-medium">
                {unit}s
              </p>
              <p className="tabular font-mono text-xs text-muted-foreground">
                {formatPrice(unitCents)} each
              </p>
            </div>
            <div
              role="group"
              aria-labelledby="qty-label"
              className="flex items-center rounded-md border bg-background"
            >
              <button
                type="button"
                aria-label="One fewer"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => clamp(q - 1))}
                className="flex size-11 items-center justify-center rounded-l-md transition-colors hover:bg-muted disabled:opacity-35"
              >
                <MinusIcon className="size-4" />
              </button>
              <output
                aria-live="polite"
                className="tabular w-9 text-center font-mono"
              >
                {quantity}
              </output>
              <button
                type="button"
                aria-label="One more"
                disabled={quantity >= MAX_QUANTITY}
                onClick={() => setQuantity((q) => clamp(q + 1))}
                className="flex size-11 items-center justify-center rounded-r-md transition-colors hover:bg-muted disabled:opacity-35"
              >
                <PlusIcon className="size-4" />
              </button>
            </div>
          </div>

          {addon ? (
            <label
              htmlFor="intl"
              className="flex cursor-pointer items-center gap-3 border-t px-5 py-4"
            >
              <span
                aria-hidden
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"
              >
                <PhoneIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{addon.name}</span>
                <span className="tabular font-mono text-xs text-muted-foreground">
                  +{formatPrice(addon.price_cents)} per {unit}
                </span>
              </span>
              <Switch id="intl" checked={intl} onCheckedChange={setIntl} />
            </label>
          ) : null}

          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            <Line
              label={`${quantity} x ${plan.carrierName} ${plan.name}`}
              value={formatPrice(unitCents * quantity)}
            />
            {intl && addon ? (
              <Line
                label={`${quantity} x ${addon.name.toLowerCase()}`}
                value={formatPrice(addon.price_cents * quantity)}
              />
            ) : null}
            {physical ? (
              <Line
                label="Shipping"
                value={shipping ? formatPrice(shipping) : "Free"}
              />
            ) : null}
            <div className="flex items-baseline justify-between gap-4 pt-2">
              <dt className="font-medium">Total</dt>
              <dd
                aria-live="polite"
                className="tabular font-mono text-2xl font-medium tracking-tight"
              >
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          <div className="hidden flex-col gap-3 border-t p-5 lg:flex">
            {alert}
            <Button
              type="submit"
              size="xl"
              disabled={pending}
              className="w-full"
            >
              {submitLabel}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockSimpleIcon className="size-3.5" />
              No account needed
            </p>
          </div>
        </div>

        <NextSteps physical={physical} className="mt-6 max-lg:hidden" />
      </aside>

      {/* Keyed by the returned values so fields remount with them after a failed submit. */}
      <div
        key={JSON.stringify(values)}
        className="flex min-w-0 flex-col gap-6 lg:order-1"
      >
        <FormCard>
          <FormSection
            title="Contact"
            description="Your order link and updates go to this email."
          >
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                defaultValue={values.name}
                aria-invalid={invalid("name")}
              />
              {err("name")}
            </Field>
            <Field data-invalid={invalid("email")}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                defaultValue={values.email}
                aria-invalid={invalid("email")}
              />
              {err("email")}
            </Field>
            <Field data-invalid={invalid("phone")} className="sm:col-span-full">
              <FieldLabel htmlFor="phone">Phone or WhatsApp</FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                defaultValue={values.phone}
                aria-invalid={invalid("phone")}
              />
              {errors.phone ? (
                err("phone")
              ) : (
                <FieldDescription>
                  With country code, for example +94 77 123 4567. Only used
                  about this order.
                </FieldDescription>
              )}
            </Field>
          </FormSection>

          <FormSection
            title="Your US number"
            description="We match the number to where you will use it."
          >
            <Field data-invalid={invalid("zip")}>
              <FieldLabel htmlFor="zip">US ZIP code</FieldLabel>
              <Input
                id="zip"
                name="zip"
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                required
                defaultValue={values.zip}
                aria-invalid={invalid("zip")}
                className="tabular font-mono"
              />
              {errors.zip ? (
                err("zip")
              ) : (
                <FieldDescription>
                  Where you will mostly be, for example 10001.
                </FieldDescription>
              )}
            </Field>
            <Field data-invalid={invalid("area_code")}>
              <FieldLabel htmlFor="area_code">
                Area code{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Input
                id="area_code"
                name="area_code"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                defaultValue={values.area_code}
                aria-invalid={invalid("area_code")}
                className="tabular font-mono"
              />
              {errors.area_code ? (
                err("area_code")
              ) : (
                <FieldDescription>
                  For a number that starts with it, like 212. If it is not
                  available, you get the nearest one.
                </FieldDescription>
              )}
            </Field>
          </FormSection>

          {physical ? (
            <FormSection
              title="Delivery address"
              description="SIM cards ship by USPS to a US address."
              cols={3}
            >
              <Field
                data-invalid={invalid("line1")}
                className="sm:col-span-full"
              >
                <FieldLabel htmlFor="line1">Street address</FieldLabel>
                <Input
                  id="line1"
                  name="line1"
                  autoComplete="address-line1"
                  required
                  defaultValue={values.line1}
                  aria-invalid={invalid("line1")}
                />
                {err("line1")}
              </Field>
              <Field className="sm:col-span-full">
                <FieldLabel htmlFor="line2">
                  Apartment, suite or hotel room{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  id="line2"
                  name="line2"
                  autoComplete="address-line2"
                  defaultValue={values.line2}
                />
              </Field>
              <Field data-invalid={invalid("city")}>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <Input
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  required
                  defaultValue={values.city}
                  aria-invalid={invalid("city")}
                />
                {err("city")}
              </Field>
              <Field data-invalid={invalid("state")}>
                <FieldLabel htmlFor="state">State</FieldLabel>
                <Select
                  name="state"
                  items={usStates.map((s) => ({
                    value: s.code,
                    label: s.name,
                  }))}
                  value={stateCode || null}
                  onValueChange={(v) => setStateCode(String(v ?? ""))}
                >
                  <SelectTrigger
                    id="state"
                    aria-invalid={invalid("state")}
                    className="w-full"
                  >
                    <SelectValue placeholder="Choose a state" />
                  </SelectTrigger>
                  <SelectContent>
                    {usStates.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err("state")}
              </Field>
              <Field data-invalid={invalid("ship_zip")}>
                <FieldLabel htmlFor="ship_zip">ZIP code</FieldLabel>
                <Input
                  id="ship_zip"
                  name="ship_zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  required
                  defaultValue={values.ship_zip}
                  aria-invalid={invalid("ship_zip")}
                  className="tabular font-mono"
                />
                {err("ship_zip")}
              </Field>
            </FormSection>
          ) : null}
        </FormCard>

        <div className="lg:hidden">{alert}</div>
        <NextSteps physical={physical} className="lg:hidden" />

        {/* Honeypot */}
        <div
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        >
          <label htmlFor="company">Company</label>
          <input id="company" name="company" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {/* Phones: total and the action always in reach. */}
      <ActionBar>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Total, {quantity} {quantity === 1 ? unit : `${unit}s`}
          </p>
          <p
            aria-hidden
            className="tabular font-mono text-xl font-medium tracking-tight"
          >
            {formatPrice(total)}
          </p>
        </div>
        <Button type="submit" size="xl" disabled={pending} className="flex-1">
          {submitLabel}
        </Button>
      </ActionBar>
    </form>
  )
}

function NextSteps({
  physical,
  className,
}: {
  physical: boolean
  className?: string
}) {
  const steps = physical
    ? [
        "Your private order page opens straight away.",
        "Your SIM card ships by USPS, with tracking on that page and by email.",
        "Insert it when you land and switch the line on.",
      ]
    : [
        "Your private order page opens straight away.",
        "Your QR code arrives by email and on that page.",
        "Scan it to install, then switch the line on when you land.",
      ]
  return (
    <section aria-label="What happens next" className={className}>
      <h2 className="type-card-title text-sm">What happens next</h2>
      <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span
              aria-hidden
              className="tabular w-3 shrink-0 font-mono text-xs leading-5 text-copper-ink"
            >
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="tabular shrink-0 font-mono">{value}</dd>
    </div>
  )
}

function clamp(n: number) {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.round(n)))
}
