import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { listCarriers } from "@/lib/admin/queries"
import { PlanForm } from "../plan-form"

export const metadata: Metadata = { title: "New plan" }

export default function NewPlanPage({ searchParams }: PageProps<"/admin/plans/new">) {
  return (
    <>
      <Link href="/admin/plans" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Plans
      </Link>
      <AdminPageHeader title="New plan" description="Plans start withdrawn. Add day packages and publish when ready." />
      <Suspense fallback={<FormSkeleton sections={3} />}>
        <NewPlanForm searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function NewPlanForm({ searchParams }: Pick<PageProps<"/admin/plans/new">, "searchParams">) {
  const [{ carrier }, carriers] = await Promise.all([searchParams, listCarriers()])
  if (!carriers.length) redirect("/admin/carriers")
  return <PlanForm carriers={carriers} defaultCarrierId={typeof carrier === "string" ? carrier : undefined} />
}
