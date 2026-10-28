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
import { Textarea } from "@/components/ui/textarea"
import { WalletMeter } from "@/components/dealer/wallet-meter"
import { ActionBar } from "@/components/patterns/action-bar"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { Notice } from "@/components/patterns/notice"
import type { DealerCatalogRow } from "@/lib/dealer-orders"
import { formatDays, formatPrice } from "@/lib/format"
import { placeDealerRefill } from "./actions"

const MAX_PER_LINE = 500
const MAX_NUMBERS = 1000
const MAX_LINES = 30

type Line = { key: number; planId: string | null; packageId: string | null; calling: boolean; text: string }
type Parsed = { phone: string; iccid: string }

let nextKey = 1
const newLine = (): Line => ({ key: nextKey++, planId: null, packageId: null, calling: false, text: "" })

type Problem = "not_us" | "bad_iccid" | "repeat"
type ParsedLine = { numbers: Parsed[]; problems: { row: number; problem: Problem }[] }

const ICCID = /^\d{18,22}[Ff]?$/

/** The number as the database keys it: its 10 digits, without a leading 1. */
const keyOf = (phone: string) => phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")

function isUsNumber(part: string) {
  const digits = part.replace(/\D/g, "")
  return !/[^\d\s()+.-]/.test(part) && (digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))
}

/**
 * One pasted row: a US phone number and, if known, the SIM's ICCID, separated by a comma,
 * tab or space, in either order; or several numbers separated by commas or tabs.
 */
function parseRow(row: string): Parsed[] | Problem {
  const parts = row.split(/[,;\t]+|\s{2,}/).map((p) => p.trim()).filter(Boolean)
  const pieces = parts.length > 1 ? parts : row.trim().split(/\s+(?=\d{18,22}[Ff]?$)/)
  const phones: string[] = []
  const iccids: string[] = []
  for (const part of pieces) {
    const digits = part.replace(/[\s()+.-]/g, "")
    if (ICCID.test(digits)) iccids.push(digits)
    else if (isUsNumber(part)) phones.push(part)
    // A long run of digits that is no US number is an ICCID typed wrong.
    else if (/^\d{12,}$/.test(digits) || /^[02-9]\d{10}$/.test(digits)) return "bad_iccid"
    else return "not_us"
  }
  if (!phones.length || iccids.length > 1 || (iccids.length && phones.length > 1)) return "not_us"
  return phones.map((phone) => ({ phone, iccid: iccids[0] ?? "" }))
}

/** Every line's numbers, with each problem row named; a number already seen on any line is a repeat. */
function parseLines(texts: string[]): ParsedLine[] {
  const seen = new Set<string>()
  return texts.map((text) => {
    const out: ParsedLine = { numbers: [], problems: [] }
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .forEach((row, i) => {
        if (!row) return
        const parsed = parseRow(row)
        if (typeof parsed === "string") return void out.problems.push({ row: i + 1, problem: parsed })
        for (const n of parsed) {
          const key = keyOf(n.phone)
          if (seen.has(key)) return void out.problems.push({ row: i + 1, problem: "repeat" })
          seen.add(key)
          out.numbers.push(n)
        }
      })
    return out
  })
}

const rowList = (rows: number[]) => {
  const shown = rows.slice(0, 5)
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : `${shown[0]}`
  return `${rows.length > 1 ? "Rows" : "Row"} ${list}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}`
}

/** One sentence per kind of problem: "Rows 2 and 4 are not US numbers." */
function problemText(problems: ParsedLine["problems"]) {
  const of = (p: Problem) => problems.filter((x) => x.problem === p).map((x) => x.row)
  const many = (rows: number[]) => rows.length > 1
  const out: string[] = []
  const notUs = of("not_us")
  if (notUs.length) out.push(`${rowList(notUs)} ${many(notUs) ? "are not US numbers" : "is not a US number"}. Put one number per row, then its ICCID if you have it.`)
  const iccid = of("bad_iccid")
  if (iccid.length) out.push(`${rowList(iccid)} ${many(iccid) ? "have an ICCID" : "has an ICCID"} that is not 18 to 22 digits.`)
  const repeat = of("repeat")
  if (repeat.length) out.push(`${rowList(repeat)} ${many(repeat) ? "repeat numbers" : "repeats a number"} already in this refill.`)
  return out.join(" ")
}

export function RefillBuilder({
  catalog,
  callingCents,
  availableCents,
}: {
  catalog: DealerCatalogRow[]
  callingCents: number | null
  availableCents: number
}) {
  const router = useRouter()
  const plans = React.useMemo(() => {
    const out: { id: string; label: string; carrier: string; packages: { id: string; days: number; price_cents: number }[] }[] = []
    for (const r of catalog) {
      let p = out.find((x) => x.id === r.plan_id)
      if (!p) {
        p = { id: r.plan_id, label: `${r.carrier_name} ${r.plan_name}`, carrier: r.carrier_name, packages: [] }
        out.push(p)
      }
      p.packages.push({ id: r.day_package_id, days: r.days, price_cents: r.price_cents })
    }
    return out
  }, [catalog])
  const carriers = [...new Set(plans.map((p) => p.carrier))]

  const [lines, setLines] = React.useState<Line[]>(() => [newLine()])
  const [reference, setReference] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const parsedLines = parseLines(lines.map((l) => l.text))
  const priced = lines.map((line, i) => {
    const plan = plans.find((p) => p.id === line.planId)
    const pkg = plan?.packages.find((p) => p.id === line.packageId)
    const calling = line.calling && callingCents !== null ? callingCents : 0
    const { numbers, problems } = parsedLines[i]
    const each = pkg ? pkg.price_cents + calling : 0
    const tooMany = numbers.length > MAX_PER_LINE
    return { line, plan, pkg, calling, numbers, problems, tooMany, each, subtotal: each * numbers.length }
  })
  const total = priced.reduce((n, p) => n + p.subtotal, 0)
  const count = priced.reduce((n, p) => n + p.numbers.length, 0)
  const short = total > availableCents
  const overTotal = count > MAX_NUMBERS
  const complete = priced.every((p) => p.pkg && p.numbers.length > 0 && !p.tooMany && p.problems.length === 0)
  const canPlace = complete && !short && !overTotal && total > 0

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    const wrong = priced.find((p) => !p.pkg || !p.numbers.length || p.problems.length || p.tooMany)
    if (wrong) {
      setErrors({
        [`line-${wrong.line.key}`]: !wrong.pkg
          ? "Choose a plan and a length"
          : wrong.problems.length
            ? problemText(wrong.problems)
            : wrong.tooMany
              ? `At most ${MAX_PER_LINE} numbers per line. Move the rest to a new line.`
              : "Paste at least one number",
      })
      return
    }
    if (overTotal) return
    setErrors({})
    start(async () => {
      const result = await placeDealerRefill({
        lines: priced.map((p) => ({ day_package_id: p.pkg!.id, intl_calling: p.calling > 0, numbers: p.numbers })),
        reference,
      })
      if (!result.ok) {
        setServerError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? "Refill placed")
      router.push(`/dealer/orders/${result.id}`)
    })
  }

  const placeLabel = pending ? "Placing refill..." : "Place refill"
  const shortNotice = overTotal ? (
    <Notice tone="warning" title={`At most ${MAX_NUMBERS.toLocaleString("en-US")} numbers per refill`}>
      This refill has {count.toLocaleString("en-US")}. Place the rest as a second refill.
    </Notice>
  ) : short ? (
    <Notice tone="warning" title={`You need ${formatPrice(total - availableCents)} more`}>
      <Link href="/dealer/wallet" className="font-medium underline underline-offset-3">
        Top up
      </Link>{" "}
      or ask us to add funds, then place the refill.
    </Notice>
  ) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <FormCard>
          <div className="p-5 sm:p-6">
            <h2 className="type-card-title">Lines</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One plan and length per line, then the numbers to refill with it: up to {MAX_PER_LINE} per line and {MAX_NUMBERS}{" "}
              in all. Prices are yours, per number.
            </p>
          </div>
          <ol className="divide-y">
            {priced.map(({ line, plan, pkg, numbers, problems, tooMany, each, subtotal }, i) => {
              const n = i + 1
              const err = errors[`line-${line.key}`]
              return (
                <li key={line.key} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Line {n}</p>
                    <div className="flex items-center gap-1">
                      <span className="tabular font-mono text-sm" aria-label={`Line ${n} subtotal`}>
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
                    <Field>
                      <FieldLabel htmlFor={`plan-${line.key}`}>Plan</FieldLabel>
                      <Select
                        items={plans.map((p) => ({ value: p.id, label: p.label }))}
                        value={line.planId}
                        onValueChange={(v) => {
                          const next = plans.find((p) => p.id === String(v))
                          const keep = next?.packages.find((p) => p.days === pkg?.days)
                          update(line.key, { planId: next?.id ?? null, packageId: keep?.id ?? null })
                        }}
                      >
                        <SelectTrigger id={`plan-${line.key}`} className="w-full">
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
                                    {p.label}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`days-${line.key}`}>Length</FieldLabel>
                      <Select
                        items={(plan?.packages ?? []).map((p) => ({ value: p.id, label: `${formatDays(p.days)}, ${formatPrice(p.price_cents)}` }))}
                        value={line.packageId}
                        onValueChange={(v) => v && update(line.key, { packageId: String(v) })}
                        disabled={!plan}
                      >
                        <SelectTrigger id={`days-${line.key}`} className="w-full">
                          <SelectValue placeholder={plan ? "Choose" : "Plan first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(plan?.packages ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex w-full justify-between gap-4">
                                {formatDays(p.days)}
                                <span className="tabular font-mono">{formatPrice(p.price_cents)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field data-invalid={Boolean(err || problems.length || tooMany) || undefined}>
                    <FieldLabel htmlFor={`numbers-${line.key}`}>Numbers</FieldLabel>
                    <Textarea
                      id={`numbers-${line.key}`}
                      rows={5}
                      value={line.text}
                      onChange={(e) => update(line.key, { text: e.currentTarget.value })}
                      aria-invalid={Boolean(err || problems.length || tooMany) || undefined}
                      // Grows with the list up to a point, then scrolls: a list can be 500 numbers.
                      className="tabular max-h-72 overflow-y-auto font-mono"
                    />
                    {err ? (
                      <FieldError>{err}</FieldError>
                    ) : problems.length ? (
                      <FieldError>{problemText(problems)}</FieldError>
                    ) : tooMany ? (
                      <FieldError>{`${numbers.length} numbers: at most ${MAX_PER_LINE} per line. Move the rest to a new line.`}</FieldError>
                    ) : (
                      <FieldDescription>
                        One per line: the phone number, then the ICCID if you have it, for example (212) 555-0100,
                        8901260000000000101. {numbers.length ? `${numbers.length} ${numbers.length === 1 ? "number" : "numbers"}` : ""}
                        {numbers.length && each ? `, ${formatPrice(each)} each.` : ""}
                      </FieldDescription>
                    )}
                  </Field>
                  {callingCents !== null ? (
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                      <Switch checked={line.calling} onCheckedChange={(c) => update(line.key, { calling: c })} />
                      <span>
                        International calling <span className="tabular font-mono text-muted-foreground">+{formatPrice(callingCents)}</span>
                      </span>
                    </label>
                  ) : null}
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
            <h2 className="type-card-title">Refill summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {priced.map(({ line, plan, pkg, numbers, subtotal }, i) => (
                <div key={line.key} className="flex items-baseline justify-between gap-4">
                  <dt className="min-w-0 text-muted-foreground">
                    {plan && pkg ? `${plan.label}, ${formatDays(pkg.days)} x ${numbers.length}` : `Line ${i + 1}, not chosen yet`}
                  </dt>
                  <dd className="tabular shrink-0 font-mono">{formatPrice(subtotal)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t pt-3">
                <dt className="font-medium">
                  Total, <span className="tabular">{count}</span> {count === 1 ? "number" : "numbers"}
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
              Funds are held now and taken as each number is refilled. Anything not refilled is returned.
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
            Total, <span className="tabular">{count}</span> {count === 1 ? "number" : "numbers"}
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
