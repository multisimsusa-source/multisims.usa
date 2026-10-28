"use client"

import * as React from "react"
import Link from "next/link"
import { LockSimpleIcon, PhoneIcon, SpinnerIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ActionBar } from "@/components/patterns/action-bar"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { Notice } from "@/components/patterns/notice"
import { CallingDestinations } from "@/components/site/calling-destinations"
import { DiscountCode } from "@/components/site/discount-code"
import { formatDays, formatPrice } from "@/lib/format"
import { discountableCents, discountFor, minimumOrderMessage, orderTotal, type DiscountRule } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { placeRefill, type RefillField, type RefillState } from "./actions"

export type RefillPlan = {
  slug: string
  name: string
  /** A SIM card plan; only these can start a SIM card bought on its own. */
  sim: boolean
  facts: string
  packages: { days: number; price_cents: number; regular_price_cents: number | null }[]
}
export type RefillCarrier = { slug: string; name: string; plans: RefillPlan[] }
export type RefillPrefill = {
  mode: "refill" | "activate"
  carrier?: string
  line_phone?: string
  iccid?: string
  name?: string
  email?: string
  phone?: string
  zip?: string
}

type Props = {
  carriers: RefillCarrier[]
  prefill: RefillPrefill
  addon: { name: string; description: string; price_cents: number } | null
  callingList: boolean
  fees: { networkFeeCents: number; minimumCents: number }
  takesPayment: boolean
}

/**
 * Refill a number, or activate a SIM card bought without a plan. Same layout as checkout:
 * the details left, the order and its total right (first on phones), the total and the
 * button held at the bottom of the screen on phones.
 */
export function RefillForm({ carriers, prefill, addon, callingList, fees, takesPayment }: Props) {
  const [state, action, pending] = React.useActionState<RefillState, FormData>(placeRefill, { status: "idle" })
  const values: Record<string, string | undefined> = state.values ?? {
    line_phone: prefill.line_phone,
    iccid: prefill.iccid,
    name: prefill.name,
    email: prefill.email,
    phone: prefill.phone,
    zip: prefill.zip,
  }
  const errors = state.fieldErrors ?? {}
  const formRef = React.useRef<HTMLFormElement>(null)

  const [mode, setMode] = React.useState<"refill" | "activate">((state.values?.mode as "refill" | "activate") ?? prefill.mode)
  // Activating a SIM card needs a SIM card plan; a refill can be any plan of the carrier.
  const offered = (c: RefillCarrier) => (mode === "activate" ? c.plans.filter((p) => p.sim) : c.plans)
  const shownCarriers = carriers.filter((c) => offered(c).length)
  const [carrierSlug, setCarrierSlug] = React.useState<string>(
    state.values?.carrier ?? prefill.carrier ?? (carriers.length === 1 ? carriers[0].slug : "")
  )
  const carrier = shownCarriers.find((c) => c.slug === carrierSlug) ?? null
  const carrierPlans = carrier ? offered(carrier) : []
  const [planSlug, setPlanSlug] = React.useState<string>(state.values?.plan ?? "")
  const plan = carrierPlans.find((p) => p.slug === planSlug) ?? null
  const [days, setDays] = React.useState<number | null>(state.values?.days ? Number(state.values.days) : null)
  const pkg = plan?.packages.find((p) => p.days === days) ?? null
  const [intl, setIntl] = React.useState(state.values?.intl === "on")
  const [discount, setDiscount] = React.useState<(DiscountRule & { code: string }) | null>(null)

  const unitCents = pkg?.price_cents ?? 0
  const addonCents = intl && addon && pkg ? addon.price_cents : 0
  const priceInput = { unitCents, addonCents, quantity: 1, physical: false, simCardCents: 0 }
  const discountCents = discount && pkg ? discountFor(discount, discountableCents(priceInput)) : 0
  const total = pkg ? orderTotal({ ...priceInput, shippingCents: 0, networkFeeCents: fees.networkFeeCents, discountCents }) : 0
  const belowMinimum = Boolean(pkg) && total < fees.minimumCents
  const activate = mode === "activate"

  React.useEffect(() => {
    if (state.status !== "error") return
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    const target = first ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]')
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    first?.focus({ preventScroll: true })
  }, [state])

  const err = (name: RefillField) => (errors[name] ? <FieldError>{errors[name]}</FieldError> : null)
  const invalid = (name: RefillField) => Boolean(errors[name]) || undefined

  const alert = belowMinimum ? (
    <Notice tone="warning" icon={false}>
      {minimumOrderMessage(fees.minimumCents, "Choose a longer plan.")}
    </Notice>
  ) : state.status === "error" && state.message && (state.values?.mode ?? mode) === mode ? (
    <Notice tone="danger" icon={false}>
      {state.message}
    </Notice>
  ) : null

  const submitLabel = pending ? (
    <>
      <SpinnerIcon className="animate-spin" />
      {takesPayment ? "Opening payment..." : "Placing order..."}
    </>
  ) : takesPayment ? (
    "Continue to payment"
  ) : activate ? (
    "Activate my SIM"
  ) : (
    "Refill my number"
  )

  const carrierItems = shownCarriers.map((c) => ({ value: c.slug, label: c.name }))
  const planItems = carrierPlans.map((p) => ({ value: p.slug, label: p.name }))
  const dayItems = (plan?.packages ?? []).map((p) => ({ value: String(p.days), label: `${formatDays(p.days)}, ${formatPrice(p.price_cents)}` }))

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-10">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="carrier" value={carrierSlug} />
      <input type="hidden" name="plan" value={planSlug} />
      <input type="hidden" name="days" value={days ?? ""} />
      {addon ? <input type="hidden" name="intl" value={intl ? "on" : "off"} /> : null}

      <div key={JSON.stringify(state.values ?? {})} className="flex min-w-0 flex-col gap-6">
        <FormCard>
          <FormSection title="What do you need?">
            <fieldset className="sm:col-span-full">
              <legend className="sr-only">What do you need?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["refill", "Refill a number"],
                    ["activate", "Activate a new SIM card"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
                      "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      mode === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    <input
                      type="radio"
                      name="mode_choice"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </FormSection>

          <FormSection
            title={activate ? "Your SIM card" : "Your number"}
            description={
              activate
                ? "The SIM card you want to start a plan on, bought from us or elsewhere."
                : "The US number to add days to. It can be a number you bought elsewhere."
            }
          >
            <Field>
              <FieldLabel htmlFor="carrier-choice">Carrier</FieldLabel>
              <Select
                items={carrierItems}
                value={carrierSlug || null}
                onValueChange={(v) => {
                  setCarrierSlug(String(v ?? ""))
                  setPlanSlug("")
                  setDays(null)
                  setDiscount(null)
                }}
              >
                <SelectTrigger id="carrier-choice" className="w-full">
                  <SelectValue placeholder="Choose the carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carrierItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {activate ? null : (
              <Field data-invalid={invalid("line_phone")}>
                <FieldLabel htmlFor="line_phone">Phone number</FieldLabel>
                <Input
                  id="line_phone"
                  name="line_phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  defaultValue={values.line_phone}
                  aria-invalid={invalid("line_phone")}
                  className="tabular font-mono"
                />
                {errors.line_phone ? err("line_phone") : <FieldDescription>The US number, for example (212) 555-0100.</FieldDescription>}
              </Field>
            )}
            <Field data-invalid={invalid("iccid")} className="sm:col-span-full">
              <FieldLabel htmlFor="iccid">
                ICCID {activate ? null : <span className="font-normal text-muted-foreground">(optional, but it helps)</span>}
              </FieldLabel>
              <Input
                id="iccid"
                name="iccid"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={values.iccid}
                aria-invalid={invalid("iccid")}
                className="tabular font-mono"
              />
              {errors.iccid ? (
                err("iccid")
              ) : (
                <FieldDescription>18 to 22 digits, printed on the SIM card and on its holder.</FieldDescription>
              )}
            </Field>
            {activate ? (
              <>
                <Field data-invalid={invalid("zip")}>
                  <FieldLabel htmlFor="zip">US ZIP code</FieldLabel>
                  <Input
                    id="zip"
                    name="zip"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={5}
                    defaultValue={values.zip}
                    aria-invalid={invalid("zip")}
                    className="tabular font-mono"
                  />
                  {errors.zip ? err("zip") : <FieldDescription>Where you will mostly be, for example 10001.</FieldDescription>}
                </Field>
                <Field data-invalid={invalid("area_code")}>
                  <FieldLabel htmlFor="area_code">
                    Area code <span className="font-normal text-muted-foreground">(optional)</span>
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
                    <FieldDescription>For a number that starts with it, like 212. If it is not available, you get the nearest one.</FieldDescription>
                  )}
                </Field>
              </>
            ) : null}
          </FormSection>

          <FormSection title="Plan" description={carrier ? undefined : "Choose the carrier first."}>
            <Field data-invalid={invalid("plan")}>
              <FieldLabel htmlFor="plan-choice">Plan</FieldLabel>
              <Select
                items={planItems}
                value={planSlug || null}
                disabled={!carrier}
                onValueChange={(v) => {
                  const next = carrierPlans.find((p) => p.slug === String(v ?? ""))
                  setPlanSlug(next?.slug ?? "")
                  setDays(next && next.packages.some((p) => p.days === days) ? days : (next?.packages[0]?.days ?? null))
                }}
              >
                <SelectTrigger id="plan-choice" className="w-full" aria-invalid={invalid("plan")}>
                  <SelectValue placeholder={carrier ? "Choose a plan" : "Carrier first"} />
                </SelectTrigger>
                <SelectContent>
                  {planItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("plan")}
            </Field>
            <Field>
              <FieldLabel htmlFor="days-choice">Length</FieldLabel>
              <Select items={dayItems} value={days !== null ? String(days) : null} disabled={!plan} onValueChange={(v) => v && setDays(Number(v))}>
                <SelectTrigger id="days-choice" className="w-full">
                  <SelectValue placeholder={plan ? "Choose" : "Plan first"} />
                </SelectTrigger>
                <SelectContent>
                  {dayItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          <FormSection title="Contact" description="Your order link and updates go to this email.">
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" maxLength={120} defaultValue={values.name} aria-invalid={invalid("name")} />
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
                defaultValue={values.email}
                aria-invalid={invalid("email")}
              />
              {err("email")}
            </Field>
            <Field data-invalid={invalid("phone")} className="sm:col-span-full">
              <FieldLabel htmlFor="phone">Phone or WhatsApp</FieldLabel>
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={values.phone} aria-invalid={invalid("phone")} />
              {errors.phone ? err("phone") : <FieldDescription>With country code, for example +94 77 123 4567. Only used about this order.</FieldDescription>}
            </Field>
          </FormSection>
        </FormCard>

        <div className="flex flex-col gap-3 lg:hidden">
          {alert}
          <Agreement takesPayment={takesPayment} />
        </div>

        {/* Honeypot */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {/* Order summary: top on phones, right rail on desktop; after the form so the keyboard
          reaches the form first. */}
      <aside aria-label="Your order" className="max-lg:order-first lg:sticky lg:top-24">
        <div className="rounded-xl border bg-card">
          <div className="p-5">
            <p className="text-sm font-medium text-muted-foreground">{activate ? "Activate a SIM card" : "Refill"}</p>
            <p className="mt-1 font-heading text-xl font-semibold tracking-[-0.02em]">
              {plan && carrier ? `${carrier.name} ${plan.name}` : "Choose a plan"}
            </p>
            {plan?.facts ? <p className="mt-1 text-sm text-muted-foreground">{plan.facts}</p> : null}
            <p className="mt-3 text-sm text-muted-foreground">
              {activate
                ? "Your plan days start when the line is activated."
                : "If your current plan is still running, the new days start the day after it ends. You keep every day you paid for."}
            </p>
          </div>

          {addon && pkg ? (
            <label htmlFor="intl" className="flex cursor-pointer items-center gap-3 border-t px-5 py-4">
              <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <PhoneIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{addon.name}</span>
                <span className="tabular font-mono text-xs text-muted-foreground">+{formatPrice(addon.price_cents)}</span>
              </span>
              <Switch id="intl" checked={intl} onCheckedChange={setIntl} />
            </label>
          ) : null}
          {addon && pkg && callingList ? (
            <div className="-mt-2 px-5 pb-2">
              <CallingDestinations />
            </div>
          ) : null}

          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            {pkg && plan && carrier ? (
              <Line label={`${carrier.name} ${plan.name}, ${formatDays(pkg.days)}`} value={formatPrice(unitCents)} />
            ) : (
              <Line label="Plan, not chosen yet" value={formatPrice(0)} />
            )}
            {intl && addon && pkg ? <Line label={addon.name} value={formatPrice(addonCents)} /> : null}
            {pkg && fees.networkFeeCents > 0 ? <Line label="Network fee" value={formatPrice(fees.networkFeeCents)} /> : null}
            {discount && pkg ? <Line label={`Discount (${discount.code})`} value={`-${formatPrice(discountCents)}`} /> : null}
            {carrier ? (
              <DiscountCode carrierSlug={carrier.slug} applied={discount} initial={state.values?.discount_code ?? ""} onChange={setDiscount} />
            ) : null}
            <div className="flex items-baseline justify-between gap-4 pt-2">
              <dt className="font-medium">Total</dt>
              <dd aria-live="polite" className="tabular font-mono text-2xl font-medium tracking-tight">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          <div className="hidden flex-col gap-3 border-t p-5 lg:flex">
            {alert}
            <Button type="submit" size="xl" disabled={pending || belowMinimum} className="w-full">
              {submitLabel}
            </Button>
            <Agreement takesPayment={takesPayment} />
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockSimpleIcon className="size-3.5" />
              {takesPayment ? "Pay with USDT (TRC-20) or Bitcoin" : "No account needed"}
            </p>
          </div>
        </div>
      </aside>

      <ActionBar>
        <div className="min-w-0">
          {/* On a phone the minimum notice is far down the form: say it here, by the button. */}
          <p className={belowMinimum ? "text-xs text-warning-ink" : "text-xs text-muted-foreground"}>
            {belowMinimum ? `Minimum ${formatPrice(fees.minimumCents)}` : "Total"}
          </p>
          <p aria-hidden className="tabular font-mono text-xl font-medium tracking-tight">
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

function Agreement({ takesPayment }: { takesPayment: boolean }) {
  if (!takesPayment) return null
  return (
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
