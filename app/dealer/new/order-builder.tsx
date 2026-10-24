"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { WalletMeter } from "@/components/dealer/wallet-meter"
import { ActionBar } from "@/components/patterns/action-bar"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { Notice } from "@/components/patterns/notice"
import { QuantityStepper } from "@/components/patterns/quantity-stepper"
import type { DealerCatalogRow, OrderingTerms } from "@/lib/dealer-orders"
import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import type { ProductType } from "@/lib/types"
import { usStates } from "@/lib/us-states"
import { placeDealerOrder } from "./actions"

const MAX_PER_LINE = 500
const MAX_SIMS = 1000
const MAX_LINES = 30

type Line = { key: number; planId: string | null; packageId: string | null; calling: boolean; quantity: number }
type PlanOption = {
  id: string
  label: string
  carrier: string
  productType: ProductType
  packages: { id: string; days: number; price_cents: number }[]
}

let nextKey = 1
const newLine = (): Line => ({ key: nextKey++, planId: null, packageId: null, calling: false, quantity: 1 })

export function OrderBuilder({ catalog, terms, availableCents }: { catalog: DealerCatalogRow[]; terms: OrderingTerms; availableCents: number }) {
  const router = useRouter()
  const plans = React.useMemo(() => groupPlans(catalog), [catalog])
  const planById = React.useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans])
  const carriers = React.useMemo(() => [...new Set(plans.map((p) => p.carrier))], [plans])

  const [lines, setLines] = React.useState<Line[]>(() => [newLine()])
  const [address, setAddress] = React.useState({ line1: "", line2: "", city: "", state: "", zip: "" })
  const [reference, setReference] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const priced = lines.map((line) => {
    const plan = line.planId ? planById.get(line.planId) : undefined
    const pkg = plan?.packages.find((p) => p.id === line.packageId)
    const calling = line.calling && terms.calling_price_cents !== null ? terms.calling_price_cents : 0
    const sim = plan?.productType === "physical" ? terms.sim_card_price_cents : 0
    const each = pkg ? pkg.price_cents + calling + sim : 0
    return { line, plan, pkg, calling, sim, each, subtotal: each * line.quantity }
  })
  const physical = priced.some((p) => p.plan?.productType === "physical")
  const shipping = physical ? terms.shipping_fee_cents : 0
  const total = priced.reduce((n, p) => n + p.subtotal, 0) + shipping
  const sims = lines.reduce((n, l) => n + l.quantity, 0)
  const complete = priced.every((p) => p.pkg)
  const short = total > availableCents
  const canPlace = complete && !short && sims <= MAX_SIMS && total > 0

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    const missing = priced.findIndex((p) => !p.pkg)
    if (missing >= 0) {
      setErrors({ [`line-${lines[missing].key}`]: "Choose a plan and a length" })
      document.getElementById(`plan-${lines[missing].key}`)?.focus()
      return
    }
    const addressErrors = physical ? checkAddress(address) : {}
    if (Object.keys(addressErrors).length) {
      setErrors(addressErrors)
      document.getElementById(Object.keys(addressErrors)[0])?.focus()
      return
    }
    setErrors({})
    start(async () => {
      const result = await placeDealerOrder({
        lines: priced.map((p) => ({ day_package_id: p.pkg!.id, quantity: p.line.quantity, intl_calling: p.calling > 0 })),
        address: physical ? address : null,
        reference,
      })
      if (!result.ok) {
        setServerError(result.error)
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? "Order placed")
      router.push(`/dealer/orders/${result.id}`)
    })
  }

  const placeLabel = pending ? "Placing order..." : "Place order"
  const shortNotice = short ? (
    <Notice tone="warning" title={`You need ${formatPrice(total - availableCents)} more`}>
      <Link href="/dealer/wallet" className="font-medium underline underline-offset-3">
        Top up
      </Link>{" "}
      or ask us to add funds, then place the order.
    </Notice>
  ) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <FormCard>
          <div className="p-5 sm:p-6">
            <h2 className="type-card-title">Lines</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Up to {MAX_PER_LINE} SIMs per line and {MAX_SIMS} per order. Prices are yours, per SIM.
            </p>
          </div>
          <ol className="divide-y">
            {priced.map(({ line, plan, pkg, each, subtotal }, i) => {
              const n = i + 1
              const err = errors[`line-${line.key}`]
              return (
                <li key={line.key} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Line {n}</p>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-sm tabular" aria-label={`Line ${n} subtotal`}>
                        {formatPrice(subtotal)}
                      </span>
                      {lines.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${n}`}
                          className="size-10 text-muted-foreground"
                          onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                        >
                          <TrashIcon />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[1fr_11rem]">
                    <Field data-invalid={Boolean(err && !plan) || undefined}>
                      <FieldLabel htmlFor={`plan-${line.key}`}>Plan</FieldLabel>
                      <Select
                        items={plans.map((p) => ({ value: p.id, label: `${p.label} (${productTypeLabel[p.productType]})` }))}
                        value={line.planId}
                        onValueChange={(v) => {
                          const next = planById.get(String(v))
                          const days = pkg?.days
                          const keep = next?.packages.find((p) => p.days === days)
                          update(line.key, { planId: next?.id ?? null, packageId: keep?.id ?? null })
                        }}
                      >
                        <SelectTrigger id={`plan-${line.key}`} className="w-full" aria-invalid={Boolean(err && !plan) || undefined}>
                          <SelectValue placeholder="Choose a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {carriers.map((carrier) => (
                            <SelectGroup key={carrier}>
                              <SelectLabel>{carrier}</SelectLabel>
                              {plans
                                .filter((p) => p.carrier === carrier)
                                .map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.label} ({productTypeLabel[p.productType]})
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field data-invalid={Boolean(err && plan && !pkg) || undefined}>
                      <FieldLabel htmlFor={`days-${line.key}`}>Length</FieldLabel>
                      <Select
                        items={(plan?.packages ?? []).map((p) => ({ value: p.id, label: `${formatDays(p.days)}, ${formatPrice(p.price_cents)}` }))}
                        value={line.packageId}
                        onValueChange={(v) => update(line.key, { packageId: v ? String(v) : null })}
                        disabled={!plan}
                      >
                        <SelectTrigger id={`days-${line.key}`} className="w-full" aria-invalid={Boolean(err && plan && !pkg) || undefined}>
                          <SelectValue placeholder={plan ? "Choose" : "Plan first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(plan?.packages ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex w-full justify-between gap-4">
                                {formatDays(p.days)}
                                <span className="font-mono tabular">{formatPrice(p.price_cents)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {err ? <FieldError className="sm:col-span-full">{err}</FieldError> : null}
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {terms.calling_price_cents !== null ? (
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                        <Switch checked={line.calling} onCheckedChange={(c) => update(line.key, { calling: c })} />
                        <span>
                          International calling{" "}
                          <span className="font-mono text-muted-foreground tabular">+{formatPrice(terms.calling_price_cents)}</span>
                        </span>
                      </label>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span id={`qty-${line.key}`} className="text-sm text-muted-foreground sm:hidden">
                        SIMs{each ? `, ${formatPrice(each)} each` : ""}
                      </span>
                      <span aria-hidden className="hidden text-sm text-muted-foreground sm:inline">
                        {each ? `${formatPrice(each)} each` : ""}
                      </span>
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(q) => update(line.key, { quantity: q })}
                        max={MAX_PER_LINE}
                        label={`Line ${n}, number of SIMs`}
                        editable
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="p-5 sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={lines.length >= MAX_LINES}
              onClick={() => setLines((ls) => [...ls, newLine()])}
              className="w-full sm:w-auto"
            >
              <PlusIcon weight="bold" data-icon="inline-start" />
              Add line
            </Button>
          </div>
        </FormCard>

        <FormCard>
          {physical ? (
            <FormSection title="Delivery address" description="All SIM cards in this order ship together by USPS, with one tracking number." cols={3}>
              <AddressField id="line1" label="Street address" value={address.line1} error={errors.line1} autoComplete="address-line1" onChange={(v) => setAddress((a) => ({ ...a, line1: v }))} wide />
              <AddressField
                id="line2"
                label="Suite or unit"
                optional
                value={address.line2}
                autoComplete="address-line2"
                onChange={(v) => setAddress((a) => ({ ...a, line2: v }))}
                wide
              />
              <AddressField id="city" label="City" value={address.city} error={errors.city} autoComplete="address-level2" onChange={(v) => setAddress((a) => ({ ...a, city: v }))} />
              <Field data-invalid={Boolean(errors.state) || undefined}>
                <FieldLabel htmlFor="state">State</FieldLabel>
                <Select
                  items={usStates.map((s) => ({ value: s.code, label: s.name }))}
                  value={address.state || null}
                  onValueChange={(v) => setAddress((a) => ({ ...a, state: String(v ?? "") }))}
                >
                  <SelectTrigger id="state" className="w-full" aria-invalid={Boolean(errors.state) || undefined}>
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
                {errors.state ? <FieldError>{errors.state}</FieldError> : null}
              </Field>
              <AddressField
                id="zip"
                label="ZIP code"
                value={address.zip}
                error={errors.zip}
                autoComplete="postal-code"
                inputMode="numeric"
                onChange={(v) => setAddress((a) => ({ ...a, zip: v }))}
                mono
              />
            </FormSection>
          ) : null}
          <FormSection title="Your reference" cols={1}>
            <Field data-invalid={Boolean(errors.reference) || undefined}>
              <FieldLabel htmlFor="reference">
                Reference <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="reference" maxLength={80} value={reference} onChange={(e) => setReference(e.currentTarget.value)} autoComplete="off" />
              {errors.reference ? (
                <FieldError>{errors.reference}</FieldError>
              ) : (
                <FieldDescription>Shown on your order list, for example your purchase order number.</FieldDescription>
              )}
            </Field>
          </FormSection>
        </FormCard>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="rounded-xl border bg-card">
          <div className="p-5">
            <h2 className="type-card-title">Order summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {priced.map(({ line, plan, pkg, subtotal }, i) =>
                pkg && plan ? (
                  <div key={line.key} className="flex items-baseline justify-between gap-4">
                    <dt className="min-w-0 text-muted-foreground">
                      {plan.label}, {formatDays(pkg.days)} x {line.quantity}
                      {line.calling && terms.calling_price_cents !== null ? ", calling" : ""}
                    </dt>
                    <dd className="shrink-0 font-mono tabular">{formatPrice(subtotal)}</dd>
                  </div>
                ) : (
                  <div key={line.key} className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Line {i + 1}, not chosen yet</dt>
                    <dd className="font-mono text-muted-foreground tabular">{formatPrice(0)}</dd>
                  </div>
                )
              )}
              {physical && terms.sim_card_price_cents > 0 ? (
                <p className="text-xs text-muted-foreground">SIM card lines include {formatPrice(terms.sim_card_price_cents)} per card.</p>
              ) : null}
              {physical ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Shipping, once per order</dt>
                  <dd className="font-mono tabular">{shipping ? formatPrice(shipping) : "Free"}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4 border-t pt-3">
                <dt className="font-medium">
                  Total, <span className="tabular">{sims}</span> {sims === 1 ? "SIM" : "SIMs"}
                </dt>
                <dd aria-live="polite" className="font-mono text-2xl font-medium tracking-tight tabular">
                  {formatPrice(total)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="border-t p-5">
            <WalletMeter availableCents={availableCents} orderCents={total} />
          </div>
          <div className="flex flex-col gap-3 border-t p-5 max-lg:hidden">
            {shortNotice}
            {serverError && !short ? <Notice tone="danger">{serverError}</Notice> : null}
            <Button type="submit" size="xl" className="w-full" disabled={pending || !canPlace}>
              {placeLabel}
            </Button>
            <p className="text-xs text-muted-foreground">Funds are held now and taken as each SIM is delivered. Anything not delivered is returned.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          {shortNotice}
          {serverError && !short ? <Notice tone="danger">{serverError}</Notice> : null}
        </div>
      </aside>

      <ActionBar className="lg:col-span-full">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Total, <span className="tabular">{sims}</span> {sims === 1 ? "SIM" : "SIMs"}
          </p>
          <p aria-hidden className="font-mono text-xl font-medium tracking-tight tabular">
            {formatPrice(total)}
          </p>
        </div>
        <Button type="submit" size="xl" disabled={pending || !canPlace} className="flex-1">
          {placeLabel}
        </Button>
      </ActionBar>
    </form>
  )
}

function AddressField({
  id,
  label,
  value,
  error,
  optional,
  wide,
  mono,
  autoComplete,
  inputMode,
  onChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  optional?: boolean
  wide?: boolean
  mono?: boolean
  autoComplete: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  onChange: (value: string) => void
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined} className={wide ? "sm:col-span-full" : undefined}>
      <FieldLabel htmlFor={id}>
        {label} {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={Boolean(error) || undefined}
        className={mono ? "font-mono tabular" : undefined}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

function checkAddress(a: { line1: string; city: string; state: string; zip: string }) {
  const out: Record<string, string> = {}
  if (a.line1.trim().length < 3) out.line1 = "Enter the street address"
  if (a.city.trim().length < 2) out.city = "Enter the city"
  if (!a.state) out.state = "Choose a state"
  if (!/^\d{5}(-\d{4})?$/.test(a.zip.trim())) out.zip = "Enter a 5-digit US ZIP code"
  return out
}

function groupPlans(rows: DealerCatalogRow[]): PlanOption[] {
  const out: PlanOption[] = []
  const index = new Map<string, PlanOption>()
  for (const r of rows) {
    let plan = index.get(r.plan_id)
    if (!plan) {
      plan = { id: r.plan_id, label: `${r.carrier_name} ${r.plan_name}`, carrier: r.carrier_name, productType: r.product_type, packages: [] }
      index.set(r.plan_id, plan)
      out.push(plan)
    }
    plan.packages.push({ id: r.day_package_id, days: r.days, price_cents: r.price_cents })
  }
  return out
}
