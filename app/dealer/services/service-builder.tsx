"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WalletMeter } from "@/components/dealer/wallet-meter"
import { ActionBar } from "@/components/patterns/action-bar"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { Notice } from "@/components/patterns/notice"
import { SegmentedChoice } from "@/components/patterns/segmented-choice"
import { formatPrice } from "@/lib/format"
import { parseLines, problemText } from "@/lib/number-paste"
import type { ServiceCode } from "@/lib/types"
import { placeDealerService } from "./actions"

const MAX_NUMBERS = 500

export type DealerServiceOffer = {
  carrier_id: string
  carrier_name: string
  service_code: ServiceCode
  service_name: string
  description: string
  price_cents: number
}

const what: Record<ServiceCode, string> = {
  esim_qr: "We add a QR code for each number. Your customer scans it to install the line as an eSIM.",
  number_change: "Each line gets a new phone number. The plan and its days stay the same.",
}

/** One service, one carrier, many numbers: priced per number, held on the wallet. */
export function ServiceBuilder({ offers, availableCents }: { offers: DealerServiceOffer[]; availableCents: number }) {
  const router = useRouter()
  const services = React.useMemo(() => {
    const out: { code: ServiceCode; name: string }[] = []
    for (const o of offers) if (!out.some((s) => s.code === o.service_code)) out.push({ code: o.service_code, name: o.service_name })
    return out
  }, [offers])
  const [service, setService] = React.useState<ServiceCode | null>(services.length === 1 ? services[0].code : null)
  const carriers = offers.filter((o) => o.service_code === service)
  const [carrierId, setCarrierId] = React.useState<string | null>(null)
  const offer = carriers.find((o) => o.carrier_id === carrierId) ?? (carriers.length === 1 ? carriers[0] : null)
  const [text, setText] = React.useState("")
  const [reference, setReference] = React.useState("")
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const [{ numbers, problems }] = parseLines([text])
  const tooMany = numbers.length > MAX_NUMBERS
  const total = offer ? offer.price_cents * numbers.length : 0
  const short = total > availableCents
  const canPlace = Boolean(offer) && numbers.length > 0 && !problems.length && !tooMany && !short
  const placeLabel = pending ? "Placing..." : numbers.length ? `Ask for ${numbers.length} ${numbers.length === 1 ? "number" : "numbers"}` : "Place request"

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!offer) return void setServerError("Choose a service and a carrier.")
    if (!numbers.length) return void setServerError("Paste at least one number.")
    if (!canPlace) return
    setServerError(null)
    start(async () => {
      const result = await placeDealerService({ carrier_id: offer.carrier_id, service: offer.service_code, numbers, reference })
      if (!result.ok) {
        setServerError(result.error)
        return void toast.error(result.error)
      }
      toast.success(result.message ?? "Request placed")
      router.push(result.id ? `/dealer/orders/${result.id}` : "/dealer/orders")
    })
  }

  const shortNotice = short ? (
    <Notice tone="warning" title={`You need ${formatPrice(total - availableCents)} more`}>
      <Link href="/dealer/wallet" className="font-medium underline underline-offset-3">
        Top up
      </Link>{" "}
      or ask us to add funds, then place the request.
    </Notice>
  ) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <FormCard>
          <FormSection title="What you need" cols={1}>
            <SegmentedChoice
              legend="Service"
              name="service"
              value={service}
              onChange={(v) => {
                setService(v)
                setCarrierId(null)
              }}
              options={services.map((s) => ({ value: s.code, label: s.name }))}
            />
            {service ? <p className="text-sm text-muted-foreground">{what[service]}</p> : null}
            <Field>
              <FieldLabel htmlFor="service-carrier">Carrier</FieldLabel>
              <Select
                items={carriers.map((c) => ({ value: c.carrier_id, label: `${c.carrier_name}, ${formatPrice(c.price_cents)} each` }))}
                value={offer?.carrier_id ?? null}
                onValueChange={(v) => setCarrierId(String(v))}
                disabled={!service}
              >
                <SelectTrigger id="service-carrier" className="w-full">
                  <SelectValue placeholder={service ? "Choose the carrier" : "Service first"} />
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
            </Field>
            <Field data-invalid={Boolean(problems.length || tooMany) || undefined}>
              <FieldLabel htmlFor="service-numbers">Numbers</FieldLabel>
              <Textarea
                id="service-numbers"
                rows={6}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                aria-invalid={Boolean(problems.length || tooMany) || undefined}
                className="tabular max-h-72 overflow-y-auto font-mono"
              />
              {problems.length ? (
                <FieldError>{problemText(problems, "request")}</FieldError>
              ) : tooMany ? (
                <FieldError>{`${numbers.length} numbers: at most ${MAX_NUMBERS} per request. Place the rest as a second request.`}</FieldError>
              ) : (
                <FieldDescription>
                  One per line: the phone number, then the ICCID if you have it, for example (212) 555-0100, 8901260000000000101.
                  {numbers.length ? ` ${numbers.length} ${numbers.length === 1 ? "number" : "numbers"}` : ""}
                  {numbers.length && offer ? `, ${formatPrice(offer.price_cents)} each.` : ""}
                </FieldDescription>
              )}
            </Field>
          </FormSection>
        </FormCard>
        <FormCard>
          <FormSection title="Your reference" cols={1}>
            <Field>
              <FieldLabel htmlFor="reference">
                Reference <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="reference" maxLength={80} value={reference} onChange={(e) => setReference(e.currentTarget.value)} autoComplete="off" />
              <FieldDescription>Shown on your order list, for example your customer&apos;s name.</FieldDescription>
            </Field>
          </FormSection>
        </FormCard>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="rounded-xl border bg-card">
          <div className="p-5">
            <h2 className="type-card-title">Request summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="min-w-0 text-muted-foreground">
                  {offer ? `${offer.carrier_name} ${offer.service_name} x ${numbers.length}` : "Not chosen yet"}
                </dt>
                <dd className="tabular shrink-0 font-mono">{formatPrice(total)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t pt-3">
                <dt className="font-medium">
                  Total, <span className="tabular">{numbers.length}</span> {numbers.length === 1 ? "number" : "numbers"}
                </dt>
                <dd aria-live="polite" className="tabular font-mono text-2xl font-medium tracking-tight">
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
            <p className="text-xs text-muted-foreground">
              Funds are held now and taken for each number once it is done. Anything not done is returned.
            </p>
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
            Total, <span className="tabular">{numbers.length}</span> {numbers.length === 1 ? "number" : "numbers"}
          </p>
          <p aria-hidden className="tabular font-mono text-xl font-medium tracking-tight">
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
