"use client"

import * as React from "react"

import { Notice } from "@/components/patterns/notice"
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
         
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? (
        <Notice tone="danger" icon={false}>
          {state.error}
        </Notice>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full text-base">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
