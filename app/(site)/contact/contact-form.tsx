"use client"

import * as React from "react"
import Script from "next/script"
import { CheckCircleIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { sendContactMessage, type ContactState } from "./actions"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function ContactForm() {
  const [state, action, pending] = React.useActionState<ContactState, FormData>(sendContactMessage, {
    status: "idle",
  })

  if (state.status === "success") {
    return (
      <div role="status" className="rounded-xl border bg-card p-8">
        <CheckCircleIcon weight="fill" className="size-8 text-success-ink" />
        <h2 className="mt-4 text-2xl font-semibold">Message sent</h2>
        <p className="mt-2 text-muted-foreground">
          Thanks for getting in touch. We reply by email, so keep an eye on your inbox.
        </p>
      </div>
    )
  }

  const errors = state.status === "error" ? state.fieldErrors ?? {} : {}
  const values = state.status === "error" ? state.values ?? {} : {}

  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-8" noValidate>
      {turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" autoComplete="name" required defaultValue={values.name} aria-invalid={Boolean(errors.name) || undefined} className="h-11" />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(errors.email) || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={values.email} aria-invalid={Boolean(errors.email) || undefined} className="h-11" />
          {errors.email ? <FieldError>{errors.email}</FieldError> : null}
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="order">
          Order number <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input id="order" name="order" defaultValue={values.order} className="h-11" />
      </Field>

      <Field data-invalid={Boolean(errors.message) || undefined}>
        <FieldLabel htmlFor="message">Message</FieldLabel>
        <Textarea id="message" name="message" rows={6} required defaultValue={values.message} aria-invalid={Boolean(errors.message) || undefined} className="min-h-36" />
        {errors.message ? <FieldError>{errors.message}</FieldError> : null}
      </Field>

      {/* Honeypot */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} /> : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="h-12 w-full text-base sm:w-fit sm:px-8">
        {pending ? "Sending..." : "Send message"}
      </Button>
    </form>
  )
}
