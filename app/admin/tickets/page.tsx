import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { TicketsList } from "@/components/staff/tickets"

export const metadata: Metadata = { title: "Tickets" }

export default function AdminTicketsPage({ searchParams }: PageProps<"/admin/tickets">) {
  return (
    <>
      <AdminPageHeader
        title="Tickets"
        description="Support requests from customers' order pages, most urgent first. Answer once; the customer sees it on their page and by email."
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: Pick<PageProps<"/admin/tickets">, "searchParams">) {
  return <TicketsList searchParams={await searchParams} base="/admin" />
}
