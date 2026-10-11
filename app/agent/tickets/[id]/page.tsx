import type { Metadata } from "next"
import { Suspense } from "react"

import { FormSkeleton } from "@/components/admin/skeletons"
import { TicketView } from "@/components/staff/tickets"

export const metadata: Metadata = { title: "Ticket" }

export default function AgentTicketPage({ params }: PageProps<"/agent/tickets/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton sections={2} />}>
      <View params={params} />
    </Suspense>
  )
}

async function View({ params }: Pick<PageProps<"/agent/tickets/[id]">, "params">) {
  const { id } = await params
  return <TicketView id={id} base="/agent" />
}
