import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { OrdersList } from "@/components/staff/orders-list"
import { requireStaff } from "@/lib/auth"

export const metadata: Metadata = { title: "Orders" }

export default function AgentOrdersPage({ searchParams }: PageProps<"/agent/orders">) {
  return (
    <>
      <AdminPageHeader title="Orders" description="Look up any order by number, customer name, email or phone." />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: Pick<PageProps<"/agent/orders">, "searchParams">) {
  const [params, viewer] = await Promise.all([searchParams, requireStaff()])
  return <OrdersList searchParams={params} base="/agent" isAdmin={viewer.role === "admin"} />
}
