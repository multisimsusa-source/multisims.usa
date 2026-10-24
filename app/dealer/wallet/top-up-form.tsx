"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { startTopUp } from "./actions"

const quick = [25_000, 50_000, 100_000]

/** Amount, then the provider's payment page. The balance rises once the payment confirms. */
export function TopUpForm({ minimumCents }: { minimumCents: number }) {
  const [amount, setAmount] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const result = await startTopUp(amount)
          if (!result.ok) return setError(result.error)
          window.location.assign(result.url)
        })
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Quick amounts</legend>
        <div className="grid grid-cols-3 gap-2">
          {quick.map((cents) => {
            const value = String(cents / 100)
            const on = amount === value
            return (
              <button
                key={cents}
                type="button"
                aria-pressed={on}
                onClick={() => setAmount(value)}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-md border px-2 font-mono text-sm font-medium tabular transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {formatPrice(cents).replace(".00", "")}
              </button>
            )
          })}
        </div>
      </fieldset>
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="topup-amount">Amount (USD)</FieldLabel>
        <Input
          id="topup-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
          aria-invalid={Boolean(error) || undefined}
          className="font-mono tabular"
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>From {formatPrice(minimumCents)}. You pay in USDT (TRC-20) or Bitcoin on our payment partner&apos;s page.</FieldDescription>
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={pending || !amount.trim()}>
        {pending ? "Opening payment page..." : "Continue to payment"}
      </Button>
    </form>
  )
}
