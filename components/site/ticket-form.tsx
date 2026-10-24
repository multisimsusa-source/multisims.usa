"use client"

import * as React from "react"
import Script from "next/script"
import { CheckCircleIcon, ImageIcon, XIcon } from "@phosphor-icons/react"

import { Notice } from "@/components/patterns/notice"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { severityLabel } from "@/lib/orders"
import type { TicketSeverity } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { FormState } from "@/lib/form-state"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const MIN = 50
const severities: TicketSeverity[] = ["low", "medium", "high", "urgent"]

type Props = {
  /** The server action that files the ticket, already bound to its order. */
  submit: (prev: FormState, formData: FormData) => Promise<FormState>
  orderLabel: string
  types: { id: string; name: string }[]
  /** Delivered SIMs the request can be about. Hidden when there is only one. */
  items: { id: string; label: string }[]
  /** Under the confirmation: where the answer will show. */
  successHint?: string
  /** Public pages ask for Turnstile when it is configured; signed-in portals do not. */
  turnstile?: boolean
  /** Inside another surface (a dealer's order line): no border or padding of its own. */
  bare?: boolean
}

export function TicketForm({ submit, orderLabel, types, items, successHint = "We email you when there is an answer, and it shows on this page too.", turnstile = true, bare }: Props) {
  const [state, action, pending] = React.useActionState<FormState, FormData>(submit, { status: "idle" })
  const [formKey, setFormKey] = React.useState(0)

  if (state.status === "success") {
    return (
      <div role="status" className={bare ? "" : "rounded-xl border bg-card p-6"}>
        <CheckCircleIcon weight="fill" className="size-7 text-success-ink" />
        <p className="mt-3 text-lg font-semibold">{state.message ?? "Request sent."}</p>
        <p className="mt-1 text-sm text-muted-foreground">{successHint}</p>
        <Button type="button" variant="outline" size="lg" className="mt-5 " onClick={() => setFormKey((k) => k + 1)}>
          Raise another request
        </Button>
      </div>
    )
  }

  return (
    <TicketFields
      key={`${formKey}-${JSON.stringify(state.values ?? {})}`}
      {...{ state, action, pending, orderLabel, types, items }}
      siteKey={turnstile ? turnstileSiteKey : undefined}
      bare={bare}
    />
  )
}

function TicketFields({
  state,
  action,
  pending,
  orderLabel,
  types,
  items,
  siteKey,
  bare,
}: Pick<Props, "orderLabel" | "types" | "items" | "bare"> & { state: FormState; action: (fd: FormData) => void; pending: boolean; siteKey?: string }) {
  const values = state.values ?? {}
  const errors = state.fieldErrors ?? {}
  const [type, setType] = React.useState(values.type ?? "")
  const [item, setItem] = React.useState(values.item || items[0]?.id || "")
  const [severity, setSeverity] = React.useState<string>(values.severity || "medium")
  const [length, setLength] = React.useState((values.description ?? "").trim().length)
  const [file, setFile] = React.useState<File | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const invalid = (k: string) => Boolean(errors[k]) || undefined

  return (
    <form action={action} noValidate className={cn("flex flex-col gap-5", !bare && "rounded-xl border bg-card p-5 sm:p-6")}>
      {siteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={invalid("type")}>
          <FieldLabel htmlFor="ticket-type">What is the problem?</FieldLabel>
          <Select name="type" items={types.map((t) => ({ value: t.id, label: t.name }))} value={type || null} onValueChange={(v) => setType(String(v ?? ""))}>
            <SelectTrigger id="ticket-type" aria-invalid={invalid("type")} className="w-full">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type ? <FieldError>{errors.type}</FieldError> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="ticket-order">Order number</FieldLabel>
          <input
            id="ticket-order"
            readOnly
            value={orderLabel}
            className="h-11 rounded-md border bg-muted px-3 font-mono text-sm text-muted-foreground tabular"
          />
        </Field>

        {items.length > 1 ? (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ticket-item">Which SIM?</FieldLabel>
            <Select name="item" items={items.map((i) => ({ value: i.id, label: i.label }))} value={item || null} onValueChange={(v) => setItem(String(v ?? ""))}>
              <SelectTrigger id="ticket-item" className="w-full">
                <SelectValue placeholder="Choose a SIM" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="item" value={items[0]?.id ?? ""} />
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">How urgent is it?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {severities.map((s) => (
            <label
              key={s}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                severity === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <input type="radio" name="severity" value={s} checked={severity === s} onChange={() => setSeverity(s)} className="sr-only" />
              {severityLabel[s]}
            </label>
          ))}
        </div>
        {errors.severity ? <p className="mt-2 text-sm text-destructive">{errors.severity}</p> : null}
      </fieldset>

      <Field data-invalid={invalid("description")}>
        <FieldLabel htmlFor="ticket-description">Describe what happens</FieldLabel>
        <Textarea
          id="ticket-description"
          name="description"
          rows={5}
          defaultValue={values.description}
          onChange={(e) => setLength(e.currentTarget.value.trim().length)}
          aria-invalid={invalid("description")}
          aria-describedby="ticket-description-count"
          placeholder="What you tried, what the phone shows, and your phone model."
          className="min-h-32"
        />
        <div className="flex items-start justify-between gap-4">
          {errors.description ? <FieldError>{errors.description}</FieldError> : <FieldDescription>Plain text, at least {MIN} characters.</FieldDescription>}
          <span id="ticket-description-count" aria-live="polite" className={cn("shrink-0 font-mono text-xs tabular", length >= MIN ? "text-success-ink" : "text-muted-foreground")}>
            {length < MIN ? `${MIN - length} more` : `${length}`}
          </span>
        </div>
      </Field>

      <Field data-invalid={invalid("screenshot")}>
        <FieldLabel htmlFor="ticket-screenshot">
          Screenshot <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <input
          ref={fileRef}
          id="ticket-screenshot"
          name="screenshot"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
            <ImageIcon data-icon="inline-start" />
            {file ? "Change image" : "Add image"}
          </Button>
          {file ? (
            <span className="flex min-w-0 items-center gap-1 text-sm">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                aria-label="Remove image"
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  if (fileRef.current) fileRef.current.value = ""
                  setFile(null)
                }}
              >
                <XIcon className="size-4" />
              </button>
            </span>
          ) : null}
        </div>
        {errors.screenshot ? (
          <FieldError>{errors.screenshot}</FieldError>
        ) : file && file.size > 5 * 1024 * 1024 ? (
          <FieldError>This image is over 5 MB. Choose a smaller one.</FieldError>
        ) : (
          <FieldDescription>PNG, JPG, GIF or WebP, up to 5 MB.</FieldDescription>
        )}
      </Field>

      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="ticket-company">Company</label>
        <input id="ticket-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} /> : null}

      {state.status === "error" && state.message ? (
        <Notice tone="danger" icon={false}>
          {state.message}
        </Notice>
      ) : null}

      <Button type="submit" size="xl" disabled={pending} className="w-full sm:w-fit sm:px-8">
        {pending ? "Sending..." : "Send request"}
      </Button>
    </form>
  )
}
