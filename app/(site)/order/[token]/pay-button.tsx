"use client"

import { useFormStatus } from "react-dom"
import { ArrowSquareOutIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"

/** Submit button for a server-action form on the order page, with its pending state. */
function FormButton({
  label,
  pendingLabel,
  external,
}: {
  label: string
  pendingLabel: string
  external?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      className="max-sm:w-full"
    >
      {pending ? pendingLabel : label}
      {external && !pending ? (
        <ArrowSquareOutIcon data-icon="inline-end" />
      ) : null}
    </Button>
  )
}

/** Opens the payment provider's page. */
export function PayButton({ label }: { label: string }) {
  return (
    <FormButton label={label} pendingLabel="Opening payment page..." external />
  )
}

/** "My SIM has arrived, activate it". */
export function ActivateButton() {
  return (
    <FormButton
      label="My SIM has arrived, activate it"
      pendingLabel="Sending..."
    />
  )
}
