import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { listAddons } from "@/lib/admin/queries"
import { AddonForm } from "./addon-form"

export const metadata: Metadata = { title: "Add-ons" }

export default function AddonsPage() {
  return (
    <>
      <AdminPageHeader
        title="Add-ons"
        description="Customers switch add-ons on at checkout. International calling is the only add-on for now and applies to every plan."
      />
      <Suspense fallback={<FormSkeleton sections={1} />}>
        <Addons />
      </Suspense>
    </>
  )
}

async function Addons() {
  const addons = await listAddons()
  return (
    <div className="flex flex-col gap-6">
      {addons.map((addon) => (
        <AddonForm key={`${addon.id}-${addon.price_cents}`} addon={addon} />
      ))}
    </div>
  )
}
