"use client"

import * as React from "react"
import { PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { LoginActiveSwitch, NewLoginButton, ResetPasswordButton } from "@/components/admin/login-controls"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { centsToInput } from "@/lib/admin/result"
import type { DealerWithLogin, OwnerEntryKind } from "@/lib/dealers"
import { formatDays, formatPrice, productTypeLabel } from "@/lib/format"
import type { ProductType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { addWalletEntry, createDealer, resetDealerPassword, saveDealerAccount, saveDealerPrices, setDealerActive } from "./actions"

export function NewDealerButton() {
  return (
    <NewLoginButton
      label="New dealer"
      title="New dealer"
      description="Opens their account and login. We email them the sign-in link; send the password yourself."
      submitLabel="Create dealer"
      action={createDealer}
      extraFields={(errors) => (
        <>
          <Field data-invalid={Boolean(errors.company) || undefined}>
            <FieldLabel htmlFor="dealer-company">Company</FieldLabel>
            <Input id="dealer-company" name="company" autoComplete="off" />
            {errors.company ? <FieldError>{errors.company}</FieldError> : <FieldDescription>Shown to agents on this dealer&apos;s orders.</FieldDescription>}
          </Field>
          <Field data-invalid={Boolean(errors.phone) || undefined}>
            <FieldLabel htmlFor="dealer-phone">
              Phone or WhatsApp <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="dealer-phone" name="phone" type="tel" inputMode="tel" autoComplete="off" />
            {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
          </Field>
        </>
      )}
    />
  )
}

export function DealerActiveSwitch({ dealerId, active, name }: { dealerId: string; active: boolean; name: string }) {
  return <LoginActiveSwitch userId={dealerId} active={active} name={name} action={setDealerActive} />
}

export function DealerPasswordButton({ dealerId, name }: { dealerId: string; name: string }) {
  return <ResetPasswordButton userId={dealerId} name={name} action={resetDealerPassword} />
}

/**
 * Owner wallet entries. "Add funds" is the everyday case (a dealer paid on WhatsApp);
 * "Correction" fixes a mistake either way. Both need a note the dealer can read.
 */
export function WalletEntryButton({ dealerId, company, mode }: { dealerId: string; company: string; mode: "add" | "correct" }) {
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<OwnerEntryKind>(mode === "add" ? "manual_add" : "adjustment_credit")
  const [amount, setAmount] = React.useState("")
  const [note, setNote] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, start] = React.useTransition()
  const id = React.useId()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setKind(mode === "add" ? "manual_add" : "adjustment_credit")
          setAmount("")
          setNote("")
          setErrors({})
        }
      }}
    >
      <DialogTrigger
        render={
          mode === "add" ? (
            <Button size="lg">
              <PlusIcon weight="bold" data-icon="inline-start" />
              Add funds
            </Button>
          ) : (
            <Button size="lg" variant="outline">
              <SlidersHorizontalIcon data-icon="inline-start" />
              Correction
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{mode === "add" ? `Add funds for ${company}` : `Correct ${company}'s balance`}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "For money the dealer paid you outside the platform. It shows on their balance at once."
              : "Fixes a mistake. The dealer sees the note next to the amount."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const result = await addWalletEntry(dealerId, kind, amount, note)
              if (!result.ok) {
                setErrors(result.fieldErrors ?? {})
                return void toast.error(result.error)
              }
              toast.success(result.message ?? "Saved")
              setOpen(false)
            })
          }}
        >
          {mode === "correct" ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Direction</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["adjustment_credit", "Add to balance"],
                    ["adjustment_debit", "Take from balance"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      kind === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <Field data-invalid={Boolean(errors.amount) || undefined}>
            <FieldLabel htmlFor={`${id}-amount`}>Amount (USD)</FieldLabel>
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              className="font-mono tabular"
            />
            {errors.amount ? <FieldError>{errors.amount}</FieldError> : <FieldDescription>For example 700.00</FieldDescription>}
          </Field>
          <Field data-invalid={Boolean(errors.note) || undefined}>
            <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
            <Textarea id={`${id}-note`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
            {errors.note ? (
              <FieldError>{errors.note}</FieldError>
            ) : (
              <FieldDescription>{mode === "add" ? "For example: Paid on WhatsApp for 100 activations" : "Say what was wrong"}</FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending || !amount.trim() || note.trim().length < 3}>
              {pending ? "Saving..." : mode === "add" ? "Add funds" : "Save correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export type PriceRow = {
  packageId: string
  carrier: string
  plan: string
  productType: ProductType
  days: number
  retailCents: number
  wholesaleCents: number | null
  dealerCents: number | null
}

/** One row per day package: retail and wholesale for reference, this dealer's own price to edit. */
export function DealerPricesForm({ dealerId, rows }: { dealerId: string; rows: PriceRow[] }) {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [pending, start] = React.useTransition()

  if (!rows.length) {
    return <p className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">No published plans yet. Publish plans under Catalogue first.</p>
  }

  const groups: { key: string; title: string; productType: ProductType; rows: PriceRow[] }[] = []
  for (const r of rows) {
    const key = `${r.carrier}|${r.plan}`
    const last = groups.at(-1)
    if (last?.key === key) last.rows.push(r)
    else groups.push({ key, title: `${r.carrier} ${r.plan}`, productType: r.productType, rows: [r] })
  }

  return (
    <form
      className="rounded-xl border bg-background"
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const result = await saveDealerPrices(dealerId, fd)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            return void toast.error(result.error)
          }
          setErrors({})
          setDirty(false)
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <Accordion multiple className="border-t-0">
        {groups.map((g) => {
          const special = g.rows.filter((r) => r.dealerCents !== null).length
          const missing = g.rows.filter((r) => r.dealerCents === null && r.wholesaleCents === null).length
          return (
            <AccordionItem key={g.key} value={g.key} className="px-4 sm:px-5">
              <AccordionTrigger className="items-center py-4 text-sm">
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium">{g.title}</span>
                  <span className="font-normal text-muted-foreground">
                    {productTypeLabel[g.productType]} &middot; {g.rows.length} {g.rows.length === 1 ? "package" : "packages"}
                    {special ? ` · ${special} special` : ""}
                    {missing ? ` · ${missing} not offered` : ""}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent keepMounted className="max-w-none pb-4 text-foreground">
                <div className="hidden grid-cols-[1fr_6rem_6rem_9rem] gap-4 pb-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Length</span>
                  <span className="text-right">Retail</span>
                  <span className="text-right">Wholesale</span>
                  <span>This dealer</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {g.rows.map((r) => {
                    const name = `price:${r.packageId}`
                    const error = errors[name]
                    return (
                      <li key={r.packageId} className="grid grid-cols-[1fr_9rem] items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_6rem_6rem_9rem]">
                        <label htmlFor={name} className="text-sm">
                          {formatDays(r.days)}
                          <span className="block text-xs text-muted-foreground sm:hidden">
                            Retail {formatPrice(r.retailCents)} &middot; Wholesale {r.wholesaleCents === null ? "not set" : formatPrice(r.wholesaleCents)}
                          </span>
                        </label>
                        <span className="hidden text-right font-mono text-sm text-muted-foreground tabular sm:block">{formatPrice(r.retailCents)}</span>
                        <span className="hidden text-right font-mono text-sm tabular sm:block">
                          {r.wholesaleCents === null ? <span className="font-sans text-muted-foreground">Not set</span> : formatPrice(r.wholesaleCents)}
                        </span>
                        <Input
                          id={name}
                          name={name}
                          inputMode="decimal"
                          autoComplete="off"
                          defaultValue={centsToInput(r.dealerCents)}
                          aria-invalid={Boolean(error) || undefined}
                          aria-describedby={error ? `${name}-error` : undefined}
                          className="font-mono tabular"
                        />
                        {error ? (
                          <p id={`${name}-error`} className="col-span-full text-sm text-danger-ink">
                            {error}
                          </p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
      <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-muted-foreground">Open a plan to set special prices. An empty field uses the wholesale price.</p>
        <Button type="submit" size="lg" disabled={pending || !dirty}>
          {pending ? "Saving..." : "Save prices"}
        </Button>
      </div>
    </form>
  )
}

export function DealerAccountForm({ dealer, defaultSimCents }: { dealer: DealerWithLogin; defaultSimCents: number }) {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [pending, start] = React.useTransition()

  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const result = await saveDealerAccount(dealer.profile_id, fd)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            return void toast.error(result.error)
          }
          setErrors({})
          setDirty(false)
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <FormCard>
        <FormSection title="Details">
          <Field data-invalid={Boolean(errors.company) || undefined}>
            <FieldLabel htmlFor="company">Company</FieldLabel>
            <Input id="company" name="company" defaultValue={dealer.company} />
            {errors.company ? <FieldError>{errors.company}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.phone) || undefined}>
            <FieldLabel htmlFor="phone">
              Phone or WhatsApp <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={dealer.phone} />
            {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.note) || undefined} className="sm:col-span-full">
            <FieldLabel htmlFor="note">
              Private note <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Textarea id="note" name="note" rows={2} maxLength={1000} defaultValue={dealer.note} />
            {errors.note ? <FieldError>{errors.note}</FieldError> : <FieldDescription>Only you see this.</FieldDescription>}
          </Field>
        </FormSection>
        <FormSection title="Terms">
          <Field data-invalid={Boolean(errors.credit_limit) || undefined}>
            <FieldLabel htmlFor="credit_limit">Credit allowed (USD)</FieldLabel>
            <Input id="credit_limit" name="credit_limit" inputMode="decimal" defaultValue={centsToInput(dealer.credit_limit_cents)} className="font-mono tabular" />
            {errors.credit_limit ? (
              <FieldError>{errors.credit_limit}</FieldError>
            ) : (
              <FieldDescription>How far below zero they may order. 0 means they pay first.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.sim_card_price) || undefined}>
            <FieldLabel htmlFor="sim_card_price">
              SIM card price (USD) <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              id="sim_card_price"
              name="sim_card_price"
              inputMode="decimal"
              defaultValue={centsToInput(dealer.sim_card_price_cents)}
              className="font-mono tabular"
            />
            {errors.sim_card_price ? (
              <FieldError>{errors.sim_card_price}</FieldError>
            ) : (
              <FieldDescription>Per physical card. Empty uses the dealer price in Settings ({formatPrice(defaultSimCents)}).</FieldDescription>
            )}
          </Field>
        </FormSection>
        <div className="flex justify-end p-4 sm:px-6">
          <Button type="submit" size="lg" disabled={pending || !dirty}>
            {pending ? "Saving..." : "Save account"}
          </Button>
        </div>
      </FormCard>
    </form>
  )
}
