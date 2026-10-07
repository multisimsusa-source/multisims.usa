import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { listCarriers } from "@/lib/admin/queries"
import { CarrierDialog } from "./carrier-dialog"
import { CarrierList } from "./carrier-list"

export const metadata: Metadata = { title: "Carriers" }

export default function CarriersPage() {
  return (
    <>
      <AdminPageHeader
        title="Carriers"
        description="Carriers appear in the logo strip on the home page in this order. Hiding a carrier hides all of its plans."
        actions={<CarrierDialog mode="create" />}
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Carriers />
      </Suspense>
    </>
  )
}

async function Carriers() {
  const carriers = await listCarriers()
  return <CarrierList carriers={carriers} />
}
