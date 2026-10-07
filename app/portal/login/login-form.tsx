"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signIn, type LoginState } from "../actions"

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = React.useActionState<LoginState, FormData>(signIn, {})

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="h-11"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full text-base">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
