import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { KeyValue, Panel } from "@/components/patterns/panel"
import { requireRole } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PasswordForm } from "./password-form"

export const metadata: Metadata = { title: "Login" }

export default function DealerAccountPage() {
  return (
    <>
      <AdminPageHeader
        title="Login"
        description="Your account details. To change the company name or email, message us."
      />
      <Suspense fallback={<FormSkeleton sections={1} />}>
        <Account />
      </Suspense>
    </>
  )
}

async function Account() {
  const profile = await requireRole("dealer")
  const { data: dealer } = await (
    await createClient()
  )
    .from("dealers")
    .select("company, phone")
    .eq("profile_id", profile.id)
    .maybeSingle()
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <PasswordForm />
      <Panel title="Account">
        <KeyValue label="Company" value={dealer?.company ?? ""} />
        <KeyValue label="Name" value={profile.full_name} />
        <KeyValue label="Email" value={profile.email} />
        {dealer?.phone ? <KeyValue label="Phone" value={dealer.phone} /> : null}
      </Panel>
    </div>
  )
}
