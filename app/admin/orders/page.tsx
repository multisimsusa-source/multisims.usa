import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { OrdersList } from "@/components/staff/orders-list"

export const metadata: Metadata = { title: "Orders" }

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <>
      <AdminPageHeader
        title="Orders"
        description="Every order. Open one to reassign it, step in and fill it yourself, cancel it, or record a refund."
      />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  return <OrdersList searchParams={await searchParams} base="/admin" isAdmin />
}
