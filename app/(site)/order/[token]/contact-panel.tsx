"use client"

import * as React from "react"
import Script from "next/script"
import { ChatCircleTextIcon, CheckCircleIcon } from "@phosphor-icons/react"

import { Notice } from "@/components/patterns/notice"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useNow } from "@/hooks/use-now"
import type { FormState } from "@/lib/form-state"
import { sendOrderMessage } from "./actions"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

/**
 * Appears once the order has been processing longer than the alert window (5 minutes
 * by default). Hidden before that, so a normal wait never looks like a problem.
 */
export function ContactPanel({ token, availableAt, alreadySent }: { token: string; availableAt: number; alreadySent: boolean }) {
  const now = useNow(5_000)
  const [open, setOpen] = React.useState(false)
  const [state, action, pending] = React.useActionState<FormState, FormData>(sendOrderMessage.bind(null, token), {
    status: alreadySent ? "success" : "idle",
  })

  if (now === null || now < availableAt) return null

  if (state.status === "success") {
    return (
      <div role="status" className="flex gap-3 rounded-xl border bg-card p-5">
        <CheckCircleIcon weight="fill" className="mt-0.5 size-5 shrink-0 text-success-ink" />
        <div>
          <p className="font-medium">Message received</p>
          <p className="mt-0.5 text-sm text-muted-foreground">We are on it and will reply by email. This page keeps updating.</p>
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Taking longer than usual?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Send us a message and we will reply by email.</p>
        </div>
        <Button type="button" variant="outline" size="lg" className="shrink-0" onClick={() => setOpen(true)}>
          <ChatCircleTextIcon data-icon="inline-start" />
          Contact us
        </Button>
      </div>
    )
  }

  const values = state.values ?? {}
  const error = state.fieldErrors?.message

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="order-message">Your message</FieldLabel>
        <Textarea
          key={values.message ?? ""}
          id="order-message"
          name="message"
          rows={4}
          autoFocus
          defaultValue={values.message}
          placeholder="For example: I land in New York in 3 hours and need the eSIM before then."
          aria-invalid={Boolean(error) || undefined}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      {turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} /> : null}
      {state.status === "error" && state.message ? (
        <Notice tone="danger" icon={false}>
          {state.message}
        </Notice>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending..." : "Send message"}
        </Button>
      </div>
    </form>
  )
}
