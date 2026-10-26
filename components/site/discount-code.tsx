"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { DiscountRule } from "@/lib/pricing"
import { checkDiscountCode } from "@/app/(site)/checkout/actions"

/**
 * "Have a discount code?" in the order summary. The code is checked on the server for the
 * preview and again when the order is placed; it never comes off shipping or the network fee.
 */
export function DiscountCode({
  carrierSlug,
  applied,
  initial,
  onChange,
}: {
  carrierSlug: string
  applied: (DiscountRule & { code: string }) | null
  initial: string
  onChange: (d: (DiscountRule & { code: string }) | null) => void
}) {
  const [open, setOpen] = React.useState(Boolean(initial))
  const [text, setText] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const id = React.useId()

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-4">
        <input type="hidden" name="discount_code" value={applied.code} />
        <span className="text-xs text-muted-foreground">Never on shipping or the network fee.</span>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setText("")
          }}
          className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline"
        >
          Remove code
        </button>
      </div>
    )
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline">
        Have a discount code?
      </button>
    )
  }

  const apply = () =>
    start(async () => {
      setError(null)
      const result = await checkDiscountCode(text, carrierSlug)
      if (!result.ok) return setError(result.error)
      onChange({ code: result.code, kind: result.kind, value: result.value })
    })

  return (
    <Field data-invalid={Boolean(error) || undefined} className="pt-1">
      <FieldLabel htmlFor={id}>Discount code</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter applies the code instead of placing the order.
            if (e.key === "Enter") {
              e.preventDefault()
              if (text.trim()) apply()
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={Boolean(error) || undefined}
          className="font-mono uppercase"
        />
        <Button type="button" variant="outline" size="lg" disabled={pending || !text.trim()} onClick={apply}>
          {pending ? "Checking..." : "Apply"}
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

