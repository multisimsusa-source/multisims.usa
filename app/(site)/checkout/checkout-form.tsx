"use client"

import * as React from "react"
import Link from "next/link"
import {
  LockSimpleIcon,
  PhoneIcon,
  SpinnerIcon,
} from "@phosphor-icons/react"

import { QuantityStepper } from "@/components/patterns/quantity-stepper"
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
import { discountableCents, discountFor, minimumOrderMessage, orderTotal, type DiscountRule } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { MAX_QUANTITY } from "@/lib/orders"
import type { ProductType } from "@/lib/types"
import { usStates } from "@/lib/us-states"
import { PriceWithSale } from "@/components/patterns/price-with-sale"
import { CallingDestinations } from "@/components/site/calling-destinations"
import { checkDiscountCode, placeOrder, type CheckoutField, type CheckoutState } from "./actions"

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
  /** The regular price when the package is on sale (unitCents is then the sale price). */
  regularCents?: number | null
  addon: { name: string; description: string; price_cents: number } | null
  initialIntl: boolean
  /** Show "See where you can call" under the calling switch. */
  callingList?: boolean
  /** From Settings, plus the minimum order actually in force. */
  fees: { shippingCents: number; simCardCents: number; networkFeeCents: number; minimumCents: number }
  /** A payment provider is set up: the buyer pays on its page after placing the order. */
  takesPayment: boolean
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
  regularCents,
  addon,
  initialIntl,
  callingList,
  fees,
  takesPayment,
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
  const [planStart, setPlanStart] = React.useState<"on_receipt" | "on_date">(values.plan_start === "on_date" ? "on_date" : "on_receipt")
  const [today] = React.useState(usToday)

  const [discount, setDiscount] = React.useState<(DiscountRule & { code: string }) | null>(null)

  const addonCents = intl && addon ? addon.price_cents : 0
  const priceInput = { unitCents, addonCents, quantity, physical, simCardCents: fees.simCardCents }
  const discountCents = discount ? discountFor(discount, discountableCents(priceInput)) : 0
  const total = orderTotal({
    ...priceInput,
    shippingCents: fees.shippingCents,
    networkFeeCents: fees.networkFeeCents,
    discountCents,
  })
  const belowMinimum = total < fees.minimumCents
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

  const alert = belowMinimum ? (
    <Notice tone="warning" icon={false}>
      {minimumOrderMessage(fees.minimumCents)}
    </Notice>
  ) : state.status === "error" && state.message ? (
    <Notice tone="danger" icon={false}>
      {state.message}
    </Notice>
  ) : null

  const agreement = takesPayment ? (
    <p className="text-center text-xs text-muted-foreground">
      By paying you agree to our{" "}
      <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/refund-policy" className="underline underline-offset-2 hover:text-foreground">
        Refund Policy
      </Link>
      .
    </p>
  ) : null

  const submitLabel = pending ? (
    <>
      <SpinnerIcon className="animate-spin" />
      {takesPayment ? "Opening payment..." : "Placing order..."}
    </>
  ) : takesPayment ? (
    "Continue to payment"
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
              <p className="text-xs text-muted-foreground">
                <PriceWithSale cents={unitCents} regularCents={regularCents} /> each
              </p>
            </div>
            <QuantityStepper value={quantity} onChange={setQuantity} max={MAX_QUANTITY} labelledBy="qty-label" />
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
          {addon && callingList ? (
            <div className="-mt-2 px-5 pb-2">
              <CallingDestinations />
            </div>
          ) : null}

          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            <Line
              label={`${plan.carrierName} ${plan.name}, ${formatDays(days)} x ${quantity}`}
              value={formatPrice(unitCents * quantity)}
            />
            {intl && addon ? (
              <Line
                label={`${addon.name} x ${quantity}`}
                value={formatPrice(addonCents * quantity)}
              />
            ) : null}
            {physical && fees.simCardCents > 0 ? (
              <Line
                label={`SIM card x ${quantity}`}
                value={formatPrice(fees.simCardCents * quantity)}
              />
            ) : null}
            {physical ? (
              <Line
                label="Shipping"
                value={fees.shippingCents ? formatPrice(fees.shippingCents) : "Free"}
              />
            ) : null}
            {fees.networkFeeCents > 0 ? (
              <Line label="Network fee" value={formatPrice(fees.networkFeeCents)} />
            ) : null}
            {discount ? <Line label={`Discount (${discount.code})`} value={`-${formatPrice(discountCents)}`} /> : null}
            <DiscountCode
              planSlug={plan.slug}
              applied={discount}
              initial={values.discount_code ?? ""}
              onChange={setDiscount}
            />
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
              disabled={pending || belowMinimum}
              className="w-full"
            >
              {submitLabel}
            </Button>
            {agreement}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockSimpleIcon className="size-3.5" />
              {takesPayment ? "Pay with USDT (TRC-20) or Bitcoin" : "No account needed"}
            </p>
          </div>
        </div>

        <NextSteps physical={physical} takesPayment={takesPayment} className="mt-6 max-lg:hidden" />
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

          {physical ? (
            <FormSection
              title="Plan start"
              description="Your plan days count from activation, so they never run while the SIM is in the post."
            >
              <fieldset className="sm:col-span-full">
                <legend className="mb-2 text-sm font-medium">When should your plan start?</legend>
                <input type="hidden" name="plan_start" value={planStart} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["on_receipt", "When I receive my SIM"],
                      ["on_date", "On a date"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
                        "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                        planStart === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      <input
                        type="radio"
                        name="plan_start_choice"
                        value={value}
                        checked={planStart === value}
                        onChange={() => setPlanStart(value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {planStart === "on_receipt"
                    ? "Your order page shows a button to start your line once the SIM arrives."
                    : "Your line starts on this date. Allow a few days for USPS delivery."}
                </p>
              </fieldset>
              {planStart === "on_date" ? (
                <Field data-invalid={invalid("activate_on")}>
                  <FieldLabel htmlFor="activate_on">Start date</FieldLabel>
                  <Input
                    id="activate_on"
                    name="activate_on"
                    type="date"
                    min={today}
                    required
                    defaultValue={values.activate_on}
                    aria-invalid={invalid("activate_on")}
                    className="tabular font-mono"
                  />
                  {err("activate_on")}
                </Field>
              ) : null}
            </FormSection>
          ) : null}
        </FormCard>

        <div className="flex flex-col gap-3 lg:hidden">
          {alert}
          {agreement}
        </div>
        <NextSteps physical={physical} takesPayment={takesPayment} className="lg:hidden" />

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
        <Button type="submit" size="xl" disabled={pending || belowMinimum} className="flex-1">
          {submitLabel}
        </Button>
      </ActionBar>
    </form>
  )
}

function NextSteps({
  physical,
  takesPayment,
  className,
}: {
  physical: boolean
  takesPayment: boolean
  className?: string
}) {
  const first = takesPayment
    ? "Pay in crypto on our payment partner's secure page. Your private order page follows."
    : "Your private order page opens straight away."
  const steps = physical
    ? [
        first,
        "Your SIM card ships by USPS, with tracking on that page and by email.",
        "Insert it when you land and switch the line on.",
      ]
    : [
        first,
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

/**
 * "Have a discount code?" in the order summary. The code is checked on the server for the
 * preview and again when the order is placed; it never comes off shipping or the network fee.
 */
function DiscountCode({
  planSlug,
  applied,
  initial,
  onChange,
}: {
  planSlug: string
  applied: (DiscountRule & { code: string }) | null
  initial: string
  onChange: (d: (DiscountRule & { code: string }) | null) => void
}) {
  const [open, setOpen] = React.useState(Boolean(initial))
  const [text, setText] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const id = React.useId()

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-4">
        <input type="hidden" name="discount_code" value={applied.code} />
        <span className="text-xs text-muted-foreground">Never on shipping or the network fee.</span>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setText("")
          }}
          className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline"
        >
          Remove code
        </button>
      </div>
    )
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline">
        Have a discount code?
      </button>
    )
  }

  const apply = () =>
    start(async () => {
      setError(null)
      const result = await checkDiscountCode(text, planSlug)
      if (!result.ok) return setError(result.error)
      onChange({ code: result.code, kind: result.kind, value: result.value })
    })

  return (
    <Field data-invalid={Boolean(error) || undefined} className="pt-1">
      <FieldLabel htmlFor={id}>Discount code</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter applies the code instead of placing the order.
            if (e.key === "Enter") {
              e.preventDefault()
              if (text.trim()) apply()
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={Boolean(error) || undefined}
          className="font-mono uppercase"
        />
        <Button type="button" variant="outline" size="lg" disabled={pending || !text.trim()} onClick={apply}>
          {pending ? "Checking..." : "Apply"}
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
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

/** Today in the US (where lines are activated), for the start date picker. */
function usToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}
