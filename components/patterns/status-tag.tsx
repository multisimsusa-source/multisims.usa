import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  HandIcon,
  HourglassMediumIcon,
  ShieldCheckIcon,
  TrayIcon,
  TruckIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr"
import type { Icon } from "@phosphor-icons/react"

import { Tag } from "@/components/patterns/tag"
import {
  customerStatusTone,
  orderStatusLabel,
  orderStatusTone,
  ticketStatusLabel,
  ticketStatusTone,
  type CustomerStatus,
  type Tone,
} from "@/lib/orders"
import type { OrderStatus, TicketStatus } from "@/lib/types"

/**
 * Status tags with an icon: the word carries the meaning, the tone and the icon let a
 * column of statuses be scanned at a glance. One component per vocabulary so every
 * screen shows the same status the same way.
 */

const orderIcons: Record<OrderStatus, Icon> = {
  awaiting_payment: HourglassMediumIcon,
  awaiting_approval: ShieldCheckIcon,
  queued: TrayIcon,
  claimed: HandIcon,
  needs_attention: WarningCircleIcon,
  shipped: TruckIcon,
  fulfilled: CheckCircleIcon,
  cancelled: XCircleIcon,
}

/** Internal order state, for the owner and agents. */
export function OrderStatusTag({ status, className }: { status: OrderStatus; className?: string }) {
  return <IconTag icon={orderIcons[status]} tone={orderStatusTone[status]} label={orderStatusLabel[status]} className={className} />
}

const customerIcons: Record<CustomerStatus, Icon> = {
  Processing: ClockIcon,
  Shipped: TruckIcon,
  Delivered: CheckCircleIcon,
  Cancelled: XCircleIcon,
}

/** What customers and dealers see: Processing, Shipped, Delivered, Cancelled. */
export function CustomerStatusTag({ status, className }: { status: CustomerStatus; className?: string }) {
  return <IconTag icon={customerIcons[status]} tone={customerStatusTone[status]} label={status} className={className} />
}

const ticketIcons: Record<TicketStatus, Icon> = {
  open: WarningCircleIcon,
  in_progress: ArrowsClockwiseIcon,
  resolved: CheckCircleIcon,
}

export function TicketStatusTag({ status, className }: { status: TicketStatus; className?: string }) {
  return <IconTag icon={ticketIcons[status]} tone={ticketStatusTone[status]} label={ticketStatusLabel[status]} className={className} />
}

function IconTag({ icon: Glyph, tone, label, className }: { icon: Icon; tone: Tone; label: string; className?: string }) {
  return (
    <Tag tone={tone} className={className}>
      <Glyph aria-hidden weight="bold" />
      {label}
    </Tag>
  )
}
