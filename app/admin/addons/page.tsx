import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { listAddons } from "@/lib/admin/queries"
import { createClient } from "@/lib/supabase/server"
import { AddonForm } from "./addon-form"
import { DestinationsPanel } from "./destinations-panel"

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
  const calling = addons.find((a) => a.code === "intl_calling")
  const { data: destinations } = calling
    ? await (await createClient()).from("addon_destinations").select("name, minutes_cap").eq("addon_id", calling.id).order("display_order").order("name").limit(5000)
    : { data: [] }
  return (
    <div className="flex flex-col gap-6">
      {addons.map((addon) => (
        <AddonForm key={`${addon.id}-${addon.price_cents}`} addon={addon} />
      ))}
      {calling ? <DestinationsPanel addonId={calling.id} destinations={destinations ?? []} /> : null}
    </div>
  )
}
