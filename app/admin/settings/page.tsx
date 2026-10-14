import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { getSettings } from "@/lib/staff/queries"
import { createClient } from "@/lib/supabase/server"
import type { Settings, TicketType } from "@/lib/types"
import { SettingsForm, TicketTypes } from "./settings-forms"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <>
      <AdminPageHeader title="Settings" description="Alerts, prices and fees, and how replacements and support requests work." />
      <Suspense fallback={<FormSkeleton sections={2} />}>
        <Forms />
      </Suspense>
    </>
  )
}

async function Forms() {
  const supabase = await createClient()
  const [settings, { data: types }] = await Promise.all([
    getSettings(),
    supabase.from("ticket_types").select("id, name, display_order, active").order("display_order"),
  ])
  return (
    <div className="flex flex-col gap-10">
      <SettingsForm settings={settings as Settings} />
      <section aria-labelledby="issue-types">
        <h2 id="issue-types" className="text-xl font-semibold">
          Issue types
        </h2>
        <p className="mt-1 mb-4 max-w-[65ch] text-sm text-muted-foreground">
          The choices customers see in the support form on their order page. Hidden types stay on old tickets.
        </p>
        <TicketTypes types={(types ?? []) as TicketType[]} />
      </section>
    </div>
  )
}
