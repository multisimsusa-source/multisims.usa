"use client"

import * as React from "react"
import Link from "next/link"
import { LockSimpleIcon, SpinnerIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ActionBar } from "@/components/patterns/action-bar"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { Notice } from "@/components/patterns/notice"
import { SegmentedChoice } from "@/components/patterns/segmented-choice"
import { ExactAmountNotice } from "@/components/site/exact-amount-notice"
import { formatPrice } from "@/lib/format"
import { minimumOrderMessage } from "@/lib/pricing"
import type { ServiceCode } from "@/lib/types"
import { placeServiceOrder, type ServiceField, type ServiceState } from "./actions"

export type WebServiceOffer = { carrier_id: string; carrier_name: string; service_code: ServiceCode; service_name: string; price_cents: number }
export type ServicePrefill = { service?: ServiceCode; carrier_id?: string; line_phone?: string; iccid?: string; name?: string; email?: string; phone?: string }

const about: Record<ServiceCode, { lead: string; after: string }> = {
  esim_qr: {
    lead: "A QR code to install your line as an eSIM: if your line is on a SIM card and you want it on an eSIM, or you lost your QR code.",
    after: "We email the QR code and it shows on your order page. Scan it to install the line. Your number and plan stay the same.",
  },
  number_change: {
    lead: "A new phone number on the same line. Your plan and its days stay the same.",
    after: "We email your new number and it shows on your order page. Restart your phone to pick it up.",
  },
}

/**
 * A QR code or a new number for a line the customer has. Same layout as refill: the details
 * left, the fee and total right (first on phones), the total and the button held at the
 * bottom of the screen on phones. The fee is shown before anything is paid.
 */
export function ServiceForm({
  offers,
  prefill,
  fees,
  takesPayment,
}: {
  offers: WebServiceOffer[]
  prefill: ServicePrefill
  fees: { networkFeeCents: number; minimumCents: number }
  takesPayment: boolean
}) {
  const [state, action, pending] = React.useActionState<ServiceState, FormData>(placeServiceOrder, { status: "idle" })
  const values: Record<string, string | undefined> = state.values ?? {
    line_phone: prefill.line_phone,
    iccid: prefill.iccid,
    name: prefill.name,
    email: prefill.email,
    phone: prefill.phone,
  }
  const errors = state.fieldErrors ?? {}
  const formRef = React.useRef<HTMLFormElement>(null)

  const services = React.useMemo(() => {
    const out: { code: ServiceCode; name: string; from: number }[] = []
    for (const o of offers) {
      const s = out.find((x) => x.code === o.service_code)
      if (s) s.from = Math.min(s.from, o.price_cents)
      else out.push({ code: o.service_code, name: o.service_name, from: o.price_cents })
    }
    return out
  }, [offers])
  const initialService = (state.values?.service as ServiceCode | undefined) ?? prefill.service ?? (services.length === 1 ? services[0].code : undefined)
  const [service, setService] = React.useState<ServiceCode | null>(services.some((s) => s.code === initialService) ? initialService! : null)
  const carriers = offers.filter((o) => o.service_code === service)
  const [carrierId, setCarrierId] = React.useState<string | null>(state.values?.carrier ?? prefill.carrier_id ?? null)
  const offer = carriers.find((c) => c.carrier_id === carrierId) ?? (carriers.length === 1 ? carriers[0] : null)
  const total = offer ? offer.price_cents + fees.networkFeeCents : 0
  const belowMinimum = Boolean(offer) && total < fees.minimumCents

  React.useEffect(() => {
    if (state.status !== "error") return
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    const target = first ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]')
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    first?.focus({ preventScroll: true })
  }, [state])

  const err = (name: ServiceField) => (errors[name] ? <FieldError>{errors[name]}</FieldError> : null)
  const invalid = (name: ServiceField) => Boolean(errors[name]) || undefined
  const alert = belowMinimum ? (
    <Notice tone="warning" icon={false}>
      {minimumOrderMessage(fees.minimumCents, "Contact us and we will help you.")}
    </Notice>
  ) : state.status === "error" && state.message ? (
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
  ) : (
    "Place order"
  )

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-10">
      <input type="hidden" name="service" value={service ?? ""} />
      <input type="hidden" name="carrier" value={offer?.carrier_id ?? ""} />

      <div key={JSON.stringify(state.values ?? {})} className="flex min-w-0 flex-col gap-6">
        <FormCard>
          <FormSection title="What do you need?" cols={1}>
            <SegmentedChoice
              legend="Service"
              name="service-choice"
              value={service}
              onChange={(v) => {
                setService(v)
                setCarrierId(null)
              }}
              options={services.map((s) => ({ value: s.code, label: s.name, hint: `from ${formatPrice(s.from)}` }))}
            />
            {errors.service ? err("service") : service ? <p className="text-sm text-muted-foreground">{about[service].lead}</p> : null}
          </FormSection>

          <FormSection title="Your line" description="The US number the service is for.">
            <Field data-invalid={invalid("carrier")} className="sm:col-span-full">
              <FieldLabel htmlFor="carrier-choice">Carrier</FieldLabel>
              <Select
                items={carriers.map((c) => ({ value: c.carrier_id, label: `${c.carrier_name}, ${formatPrice(c.price_cents)}` }))}
                value={offer?.carrier_id ?? null}
                onValueChange={(v) => setCarrierId(String(v))}
                disabled={!service}
              >
                <SelectTrigger id="carrier-choice" className="w-full" aria-invalid={invalid("carrier")}>
                  <SelectValue placeholder={service ? "Choose your carrier" : "Choose what you need first"} />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c.carrier_id} value={c.carrier_id}>
                      <span className="flex w-full justify-between gap-4">
                        {c.carrier_name}
                        <span className="tabular font-mono">{formatPrice(c.price_cents)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("carrier")}
            </Field>
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
            <Field data-invalid={invalid("iccid")}>
              <FieldLabel htmlFor="iccid">
                ICCID <span className="font-normal text-muted-foreground">(optional, but it helps)</span>
              </FieldLabel>
              <Input id="iccid" name="iccid" inputMode="numeric" autoComplete="off" defaultValue={values.iccid} aria-invalid={invalid("iccid")} className="tabular font-mono" />
              {errors.iccid ? err("iccid") : <FieldDescription>18 to 22 digits, printed on the SIM card and on its holder.</FieldDescription>}
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

      <aside aria-label="Your order" className="max-lg:order-first lg:sticky lg:top-24">
        <div className="rounded-xl border bg-card">
          <div className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Service</p>
            <p className="mt-1 font-heading text-xl font-semibold tracking-[-0.02em]">
              {offer ? `${offer.carrier_name} ${offer.service_name}` : service ? services.find((s) => s.code === service)?.name : "Choose a service"}
            </p>
            {service ? <p className="mt-3 text-sm text-muted-foreground">{about[service].after}</p> : null}
          </div>
          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            <Line label={offer ? `${offer.service_name} fee` : "Fee, carrier not chosen yet"} value={formatPrice(offer?.price_cents ?? 0)} />
            {offer && fees.networkFeeCents > 0 ? <Line label="Network fee" value={formatPrice(fees.networkFeeCents)} /> : null}
            <div className="flex items-baseline justify-between gap-4 pt-2">
              <dt className="font-medium">Total</dt>
              <dd aria-live="polite" className="tabular font-mono text-2xl font-medium tracking-tight">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>
          {takesPayment ? <ExactAmountNotice className="mx-5 mb-5" /> : null}
          <div className="hidden flex-col gap-3 border-t p-5 lg:flex">
            {alert}
            <Button type="submit" size="xl" disabled={pending || belowMinimum || !offer} className="w-full">
              {submitLabel}
            </Button>
            <Agreement takesPayment={takesPayment} />
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockSimpleIcon className="size-3.5" />
              {takesPayment ? "Pay with Bitcoin, Ethereum, USDT or USDC" : "No account needed"}
            </p>
          </div>
        </div>
      </aside>

      <ActionBar>
        <div className="min-w-0">
          <p className={belowMinimum ? "text-xs text-warning-ink" : "text-xs text-muted-foreground"}>
            {belowMinimum ? `Minimum ${formatPrice(fees.minimumCents)}` : "Total"}
          </p>
          <p aria-hidden className="tabular font-mono text-xl font-medium tracking-tight">
            {formatPrice(total)}
          </p>
        </div>
        <Button type="submit" size="xl" disabled={pending || belowMinimum || !offer} className="flex-1">
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
