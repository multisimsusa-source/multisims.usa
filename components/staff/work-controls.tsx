"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowsClockwiseIcon,
  FlagIcon,
  PaperPlaneTiltIcon,
  TruckIcon,
  UserSwitchIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmAction } from "@/components/admin/confirm-action"
import { ActionBar } from "@/components/patterns/action-bar"
import { ActionButton, ClaimButton } from "@/components/staff/order-actions"
import { NoteDialog } from "@/components/staff/note-dialog"
import {
  completeOrder,
  deliverReadyItems,
  flagOrder,
  issueReplacement,
  releaseOrder,
  saveTracking,
} from "@/app/agent/actions"
import {
  approveReplacement,
  cancelOrder,
  cancelRemainingItems,
  markOrderPaid,
  reassignOrder,
  recordRefund,
} from "@/app/admin/orders/actions"
import type { ItemNeed } from "@/lib/staff/item-need"
import type { OrderStatus } from "@/lib/types"

type WorkProps = {
  orderId: string
  status: OrderStatus
  need: ItemNeed
  canClaim: boolean
  canWork: boolean
  missing: number
  /** eSIMs without a QR code yet: they can still be delivered, the QR follows. */
  noQr?: number
  /** SIM cards with no plan: done once shipped, nothing to activate. */
  cardOnly?: boolean
  /** A bulk line where some SIMs are ready and some are not: deliver the ready ones now. */
  partial?: { ready: number; left: number } | null
  /** "eSIM" or "SIM", for the partial delivery wording. */
  unit?: string
}

const partialCopy: Record<ItemNeed, { button: (n: number, unit: string) => string; title: (n: number, unit: string) => string; description: (n: number, left: number, unit: string) => string }> = {
  qr: {
    button: (n, unit) => `Deliver ${n} ready ${unit}${n === 1 ? "" : "s"}`,
    title: (n, unit) => `Deliver ${n} ${unit}${n === 1 ? "" : "s"} now?`,
    description: (n, left, unit) =>
      `The ${n} ${unit}${n === 1 ? "" : "s"} with a QR code or phone number go to the customer now and show on their order page. The other ${left} stay here for you to finish; a missing QR code can still be added after. This cannot be undone.`,
  },
  ship: {
    button: (n) => `Mark ${n} ready shipped`,
    title: (n) => `Mark ${n} SIM card${n === 1 ? "" : "s"} shipped?`,
    description: (n, left) =>
      `The ${n} SIM card${n === 1 ? "" : "s"} with an ICCID and tracking number show as shipped on the customer's order page. The other ${left} stay here for you to finish. This cannot be undone.`,
  },
  activate: {
    button: (n) => `Deliver ${n} active line${n === 1 ? "" : "s"}`,
    title: (n) => `Deliver ${n} line${n === 1 ? "" : "s"} now?`,
    description: (n, left) =>
      `The ${n} SIM${n === 1 ? "" : "s"} with a phone number show as Delivered on the customer's order page straight away. The other ${left} stay here for you to finish. This cannot be undone.`,
  },
  refill: {
    button: () => "",
    title: () => "",
    description: () => "",
  },
  service_qr: {
    button: (n) => `Deliver ${n} ready QR code${n === 1 ? "" : "s"}`,
    title: (n) => `Send ${n} QR code${n === 1 ? "" : "s"} now?`,
    description: (n, left) =>
      `The ${n} number${n === 1 ? "" : "s"} with a QR code go to the customer now and show as Delivered. The other ${left} stay here for you to finish. This cannot be undone.`,
  },
  service_number: {
    button: (n) => `Deliver ${n} new number${n === 1 ? "" : "s"}`,
    title: (n) => `Deliver ${n} new number${n === 1 ? "" : "s"} now?`,
    description: (n, left) =>
      `The ${n} line${n === 1 ? "" : "s"} with a new number show as Delivered on the customer's order page straight away. The other ${left} stay here for you to finish. This cannot be undone.`,
  },
}

const completeCopy: Record<
  ItemNeed,
  {
    button: string
    title: string
    description: string
    confirm: string
    missing: string
  }
> = {
  qr: {
    button: "Mark complete and deliver",
    title: "Deliver to the customer now?",
    description:
      "The QR codes, numbers and ICCIDs go to the customer by email and show on their order page straight away. A QR code you have not added yet can be added after delivering: the customer gets it by email then. This cannot be undone.",
    confirm: "Deliver now",
    missing: "a QR code",
  },
  ship: {
    button: "Mark shipped",
    title: "Mark this order shipped?",
    description:
      "The tracking number goes to the customer by email and shows on their order page. The order comes back to the queue when it is time to activate. This cannot be undone.",
    confirm: "Mark shipped",
    missing: "an ICCID and tracking number",
  },
  refill: {
    button: "Mark refilled and deliver",
    title: "Is the refill done?",
    description:
      "The customer gets the plan dates by email and on their order page, and the order shows as Delivered. Dates you did not change use the proposal. This cannot be undone.",
    confirm: "Deliver now",
    missing: "dates",
  },
  activate: {
    button: "Mark active and deliver",
    title: "Are the lines active?",
    description:
      "The phone numbers go to the customer by email and show on their order page straight away, and the order shows as Delivered. This cannot be undone.",
    confirm: "Deliver now",
    missing: "a phone number",
  },
  service_qr: {
    button: "Deliver QR codes",
    title: "Send the QR codes now?",
    description:
      "The QR codes go to the customer by email and show on their order page straight away, and the order shows as Delivered. A dealer is charged for each one now. This cannot be undone.",
    confirm: "Deliver now",
    missing: "a QR code",
  },
  service_number: {
    button: "Deliver new numbers",
    title: "Are the new numbers live?",
    description:
      "The new numbers go to the customer by email and show on their order page straight away, and the order shows as Delivered. A dealer is charged for each one now. This cannot be undone.",
    confirm: "Deliver now",
    missing: "its new number",
  },
}

/** Claim, release, flag and complete: the agent's main row of actions. */
export function WorkControls({
  orderId,
  status,
  need,
  canClaim,
  canWork,
  missing,
  noQr = 0,
  cardOnly,
  partial,
  unit = "SIM",
}: WorkProps) {
  const qrHint = noQr > 0 ? `${noQr} eSIM${noQr === 1 ? " has" : "s have"} no QR code yet. You can deliver now and add ${noQr === 1 ? "it" : "them"} after.` : null
  const copy = cardOnly
    ? {
        ...completeCopy.ship,
        description:
          "The tracking number goes to the customer by email and shows on their order page. These cards have no plan, so the order is done once shipped. This cannot be undone.",
      }
    : completeCopy[need]
  if (canClaim)
    return <ClaimButton orderId={orderId} className="w-full px-8 sm:w-auto" />
  if (!canWork) return null

  const partialCopyFor = cardOnly ? partialCopy.ship : partialCopy[need]
  const deliverReady = (fullWidth: boolean) =>
    partial ? (
      <ConfirmAction
        trigger={
          <Button variant="outline" size="lg" className={fullWidth ? "w-full" : "px-6"}>
            {partialCopyFor.button(partial.ready, unit)}
          </Button>
        }
        title={partialCopyFor.title(partial.ready, unit)}
        description={partialCopyFor.description(partial.ready, partial.left, unit)}
        confirmLabel="Deliver these"
        action={() => deliverReadyItems(orderId)}
      />
    ) : null

  const complete = (fullWidth: boolean) => (
    <ConfirmAction
      trigger={
        <Button
          size="lg"
          className={fullWidth ? "w-full" : "px-6"}
          disabled={missing > 0}
        >
          <PaperPlaneTiltIcon data-icon="inline-start" weight="bold" />
          {copy.button}
        </Button>
      }
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirm}
      action={() => completeOrder(orderId)}
    />
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="max-sm:hidden">{complete(false)}</div>
      {partial ? <div className="max-sm:hidden">{deliverReady(false)}</div> : null}
      {/* Phones: the finishing action stays in reach at the bottom of the screen. */}
      <ActionBar mode="fixed" breakpoint="sm">
        <div className="flex w-full flex-col gap-2">
          {partial ? deliverReady(true) : null}
          {complete(true)}
          {missing > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              {missing} SIM{missing === 1 ? "" : "s"} still need
              {missing === 1 ? "s" : ""} {copy.missing}
            </p>
          ) : qrHint ? (
            <p className="text-center text-xs text-muted-foreground">{qrHint}</p>
          ) : null}
        </div>
      </ActionBar>
      {status === "claimed" ? (
        <NoteDialog
          trigger={
            <Button variant="outline" size="lg" className="max-sm:flex-1">
              <FlagIcon data-icon="inline-start" />
              Needs attention
            </Button>
          }
          title="Flag for the owner"
          description="Use this when you cannot fill the order as asked. If the area code is not available, do not flag: deliver the nearest area code. The owner decides what happens next. The customer still sees Processing."
          label="What is the problem?"
          placeholder="T-Mobile has no lines for this plan right now."
          confirmLabel="Flag order"
          required
          action={(note) => flagOrder(orderId, note)}
        />
      ) : null}
      <ConfirmAction
        trigger={
          <Button
            variant="ghost"
            size="lg"
            className="text-muted-foreground max-sm:flex-1 max-sm:border max-sm:border-border"
          >
            Release
          </Button>
        }
        title="Put this order back in the queue?"
        description="Another agent can then claim it. Anything you saved on the SIMs stays."
        confirmLabel="Release"
        action={() => releaseOrder(orderId)}
      />
      {missing > 0 ? (
        <p className="w-full text-sm text-muted-foreground max-sm:hidden">
          {missing} SIM{missing === 1 ? "" : "s"} still need
          {missing === 1 ? "s" : ""} {copy.missing} before you can complete
          {partial ? ". You can deliver the ready ones now." : "."}
        </p>
      ) : qrHint ? (
        <p className="w-full text-sm text-muted-foreground max-sm:hidden">{qrHint}</p>
      ) : null}
    </div>
  )
}

/** Physical SIMs: one tracking number for the whole parcel. */
export function TrackingForm({
  orderId,
  current,
  editable,
  suggested,
}: {
  orderId: string
  current: string | null
  editable: boolean
  /** Dealer batches ship in one parcel: the tracking number another line already has. */
  suggested?: string | null
}) {
  const [value, setValue] = React.useState(current ?? "")
  const [pending, start] = React.useTransition()
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-end sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const result = await saveTracking(orderId, value)
          if (result.ok) toast.success(result.message ?? "Saved")
          else toast.error(result.error)
        })
      }}
    >
      <Field className="flex-1">
        <FieldLabel htmlFor="tracking">
          <TruckIcon className="size-4" /> USPS tracking number
        </FieldLabel>
        <Input
          id="tracking"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          disabled={!editable}
          autoComplete="off"
          placeholder="9400 1000 0000 0000 0000 00"
          className="tabular font-mono"
        />
      </Field>
      {editable ? (
        <Button
          type="submit"
          size="lg"
          disabled={pending || value.trim() === (current ?? "")}
        >
          {pending ? "Saving..." : "Save for all SIMs"}
        </Button>
      ) : null}
      {editable && suggested && value !== suggested ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setValue(suggested)}
        >
          Use the batch&apos;s {suggested.slice(-6)}
        </Button>
      ) : null}
    </form>
  )
}

export function ReplaceButton({
  itemId,
  ticketId,
  label = "Issue replacement",
}: {
  itemId: string
  ticketId?: string | null
  label?: string
}) {
  const router = useRouter()
  return (
    <ConfirmAction
      trigger={
        <Button variant="outline">
          <ArrowsClockwiseIcon data-icon="inline-start" />
          {label}
        </Button>
      }
      title="Issue a free replacement?"
      description="A new order for this SIM goes into the queue with no payment. When an agent delivers it, the customer gets the new QR code and this one is marked replaced."
      confirmLabel="Issue replacement"
      action={async () => {
        const result = await issueReplacement(itemId, ticketId ?? null)
        if (result.ok && result.id) router.refresh()
        return result
      }}
    />
  )
}

type Agent = { id: string; name: string }

/** Owner-only controls on an order: reassign, approve, cancel, record refund. */
export function AdminOrderControls({
  orderId,
  status,
  claimedBy,
  agents,
  meId,
  paid,
  refunded,
  delivered,
}: {
  orderId: string
  status: OrderStatus
  claimedBy: string | null
  agents: Agent[]
  meId: string
  paid: boolean
  refunded: boolean
  /** Part of the line is delivered: only the rest can be cancelled. */
  delivered?: { done: number; left: number; dealer: boolean } | null
}) {
  const [agent, setAgent] = React.useState(claimedBy ?? meId)
  const open = ["queued", "claimed", "needs_attention"].includes(status)
  const flagged = status === "needs_attention"

  return (
    <div className="flex flex-col gap-2">
      {status === "awaiting_approval" ? (
        <ActionButton
          action={() => approveReplacement(orderId)}
          size="lg"
          className="w-full"
          pendingLabel="Approving..."
        >
          Approve replacement
        </ActionButton>
      ) : null}

      {status === "awaiting_payment" ? (
        <ConfirmAction
          trigger={
            <Button variant="outline" size="lg" className="w-full">
              Mark as paid
            </Button>
          }
          title="Mark this order as paid?"
          description="Only when you have the money: an underpayment you agreed with the customer, or a payment you checked in your own wallet. The order goes into the agent queue and the customer gets the confirmation email."
          confirmLabel="Mark as paid"
          action={() => markOrderPaid(orderId)}
        />
      ) : null}

      {flagged && claimedBy ? (
        <NoteDialog
          trigger={
            <Button size="lg" className="w-full">
              Send back to the agent
            </Button>
          }
          title="Send back with an instruction"
          description="The order returns to the same agent with your note on their screen. The customer still sees Processing."
          label="Instruction"
          placeholder="Deliver the nearest available area code."
          confirmLabel="Send back"
          required
          action={(note) => reassignOrder(orderId, claimedBy, note)}
        />
      ) : null}

      {open ? (
        <NoteDialog
          trigger={
            <Button variant="outline" size="lg" className="w-full">
              <UserSwitchIcon data-icon="inline-start" />
              {claimedBy ? "Reassign" : "Assign"}
            </Button>
          }
          title="Who should fill this order?"
          description="They see it under Yours in the agent queue. Pick yourself to fill it now."
          label="Note for them (optional)"
          confirmLabel="Assign"
          action={(note) => reassignOrder(orderId, agent, note)}
        >
          <Field>
            <FieldLabel htmlFor="assign-to">Assign to</FieldLabel>
            <Select
              items={agents.map((a) => ({
                value: a.id,
                label: a.id === meId ? `${a.name} (you)` : a.name,
              }))}
              value={agent}
              onValueChange={(v) => setAgent(String(v ?? meId))}
            >
              <SelectTrigger id="assign-to" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id === meId ? `${a.name} (you)` : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </NoteDialog>
      ) : null}

      {delivered && open ? (
        <NoteDialog
          trigger={
            <Button variant="destructive" size="lg" className="w-full">
              Cancel the other {delivered.left}
            </Button>
          }
          title={`Cancel the ${delivered.left} SIM${delivered.left === 1 ? "" : "s"} not delivered?`}
          description={
            delivered.dealer
              ? `The ${delivered.done} delivered stay delivered and are paid for. The other ${delivered.left} show as Cancelled and their share goes back to the dealer's wallet. The order is then done.`
              : `The ${delivered.done} delivered stay delivered. The other ${delivered.left} show as Cancelled and the order is then done. Refund the customer for them from your own wallet.`
          }
          label="Reason (internal)"
          placeholder="The carrier has no more lines in this area."
          confirmLabel="Cancel the rest"
          destructive
          action={(note) => cancelRemainingItems(orderId, note)}
        />
      ) : null}

      {!delivered && status !== "fulfilled" && status !== "cancelled" ? (
        <NoteDialog
          trigger={
            <Button variant="destructive" size="lg" className="w-full">
              Cancel order
            </Button>
          }
          title="Cancel this order?"
          description="Agents stop seeing it and the customer's page shows Cancelled. Record the refund separately once you have sent it."
          label="Reason (internal)"
          placeholder="Area code not available, customer asked to cancel."
          confirmLabel="Cancel order"
          destructive
          action={(note) => cancelOrder(orderId, note)}
        />
      ) : null}

      {paid && !refunded && status === "cancelled" ? (
        <NoteDialog
          trigger={
            <Button variant="outline" size="lg" className="w-full">
              Record refund
            </Button>
          }
          title="Record a refund"
          description="Send the refund from your own wallet first. This only records it; no money moves from here."
          label="Refund details"
          placeholder="Sent 25 USDT TRC-20, transaction 0x..."
          confirmLabel="Record refund"
          required
          action={(note) => recordRefund(orderId, note)}
        />
      ) : null}
    </div>
  )
}
