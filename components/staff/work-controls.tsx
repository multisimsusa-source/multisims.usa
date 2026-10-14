"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowsClockwiseIcon, FlagIcon, PaperPlaneTiltIcon, TruckIcon, UserSwitchIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmAction } from "@/components/admin/confirm-action"
import { ActionBar } from "@/components/patterns/action-bar"
import { ActionButton, ClaimButton } from "@/components/staff/order-actions"
import { NoteDialog } from "@/components/staff/note-dialog"
import { completeOrder, flagOrder, issueReplacement, releaseOrder, saveTracking } from "@/app/agent/actions"
import { approveReplacement, cancelOrder, markOrderPaid, reassignOrder, recordRefund } from "@/app/admin/orders/actions"
import type { ItemNeed } from "@/lib/staff/item-need"
import type { OrderStatus } from "@/lib/types"

type WorkProps = {
  orderId: string
  status: OrderStatus
  need: ItemNeed
  canClaim: boolean
  canWork: boolean
  missing: number
}

const completeCopy: Record<ItemNeed, { button: string; title: string; description: string; confirm: string; missing: string }> = {
  qr: {
    button: "Mark complete and deliver",
    title: "Deliver to the customer now?",
    description: "The QR codes, numbers and ICCIDs go to the customer by email and show on their order page straight away. This cannot be undone.",
    confirm: "Deliver now",
    missing: "a QR code",
  },
  ship: {
    button: "Mark shipped",
    title: "Mark this order shipped?",
    description: "The tracking number goes to the customer by email and shows on their order page. The order comes back to the queue when it is time to activate. This cannot be undone.",
    confirm: "Mark shipped",
    missing: "an ICCID and tracking number",
  },
  activate: {
    button: "Mark active and deliver",
    title: "Are the lines active?",
    description: "The phone numbers go to the customer by email and show on their order page straight away, and the order shows as Delivered. This cannot be undone.",
    confirm: "Deliver now",
    missing: "a phone number",
  },
}

/** Claim, release, flag and complete: the agent's main row of actions. */
export function WorkControls({ orderId, status, need, canClaim, canWork, missing }: WorkProps) {
  const copy = completeCopy[need]
  if (canClaim) return <ClaimButton orderId={orderId} className="w-full px-8 sm:w-auto" />
  if (!canWork) return null

  const complete = (fullWidth: boolean) => (
    <ConfirmAction
      trigger={
        <Button size="lg" className={fullWidth ? "w-full" : "px-6"} disabled={missing > 0}>
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
      {/* Phones: the finishing action stays in reach at the bottom of the screen. */}
      <ActionBar mode="fixed" breakpoint="sm">
        <div className="w-full">
          {complete(true)}
          {missing > 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {missing} SIM{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} {copy.missing}
            </p>
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
          <Button variant="ghost" size="lg" className="text-muted-foreground max-sm:flex-1 max-sm:border max-sm:border-border">
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
          {missing} SIM{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} {copy.missing} before you can complete.
        </p>
      ) : null}
    </div>
  )
}

/** Physical SIMs: one tracking number for the whole parcel. */
export function TrackingForm({ orderId, current, editable }: { orderId: string; current: string | null; editable: boolean }) {
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
          className="font-mono tabular"
        />
      </Field>
      {editable ? (
        <Button type="submit" size="lg" disabled={pending || value.trim() === (current ?? "")}>
          {pending ? "Saving..." : "Save for all SIMs"}
        </Button>
      ) : null}
    </form>
  )
}

export function ReplaceButton({ itemId, ticketId, label = "Issue replacement" }: { itemId: string; ticketId?: string | null; label?: string }) {
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
}: {
  orderId: string
  status: OrderStatus
  claimedBy: string | null
  agents: Agent[]
  meId: string
  paid: boolean
  refunded: boolean
}) {
  const [agent, setAgent] = React.useState(claimedBy ?? meId)
  const open = ["queued", "claimed", "needs_attention"].includes(status)
  const flagged = status === "needs_attention"

  return (
    <div className="flex flex-col gap-2">
      {status === "awaiting_approval" ? (
        <ActionButton action={() => approveReplacement(orderId)} size="lg" className="h-10 w-full" pendingLabel="Approving...">
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
          trigger={<Button size="lg" className="w-full">Send back to the agent</Button>}
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
              items={agents.map((a) => ({ value: a.id, label: a.id === meId ? `${a.name} (you)` : a.name }))}
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

      {status !== "fulfilled" && status !== "cancelled" ? (
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
          trigger={<Button variant="outline" size="lg" className="w-full">Record refund</Button>}
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
