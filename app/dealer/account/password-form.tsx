"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FormCard, FormSection } from "@/components/patterns/form-section"
import { changeOwnPassword } from "./actions"

export function PasswordForm() {
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, start] = React.useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const result = await changeOwnPassword(password, confirm)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            return void toast.error(result.error)
          }
          setErrors({})
          setPassword("")
          setConfirm("")
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <FormCard>
        <FormSection
          title="Change password"
          description="You stay signed in here. Other devices keep working until they sign out."
        >
          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            {errors.password ? (
              <FieldError>{errors.password}</FieldError>
            ) : (
              <FieldDescription>At least 10 characters.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.confirm) || undefined}>
            <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
            />
            {errors.confirm ? <FieldError>{errors.confirm}</FieldError> : null}
          </Field>
        </FormSection>
        <div className="flex justify-end p-4 sm:px-6">
          <Button
            type="submit"
            size="lg"
            disabled={pending || password.length < 10 || !confirm}
          >
            {pending ? "Saving..." : "Change password"}
          </Button>
        </div>
      </FormCard>
    </form>
  )
}
