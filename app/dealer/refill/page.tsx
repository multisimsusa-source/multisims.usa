import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { requireRole } from "@/lib/auth"
import { getDealerCatalog, getOrderingTerms } from "@/lib/dealer-orders"
import { getWallet } from "@/lib/dealers"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { RefillBuilder } from "./refill-builder"

export const metadata: Metadata = { title: "Refill" }

export default function DealerRefillPage() {
  return (
    <>
      <AdminPageHeader
        title="Refill"
        description="Add days to numbers that are already active, several at once. Same SIM, same number. If a plan is still running, the new days start the day after it ends."
      />
      <Suspense fallback={<FormSkeleton sections={2} />}>
        <Builder />
      </Suspense>
    </>
  )
}

async function Builder() {
  const profile = await requireRole("dealer")
  const supabase = await createClient()
  const [catalog, terms, wallet, { data: refillable }] = await Promise.all([
    getDealerCatalog(supabase),
    getOrderingTerms(profile.id),
    getWallet(supabase, profile.id),
    createServiceClient().from("plans").select("id").eq("refillable", true).eq("published", true),
  ])
  const ids = new Set((refillable ?? []).map((p) => p.id as string))
  const plans = catalog.filter((r) => ids.has(r.plan_id))

  if (!plans.length) {
    return (
      <EmptyState
        icon={<ArrowsClockwiseIcon />}
        title="No refill plans are priced for you yet"
        action={
          <Link href="/dealer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to overview
          </Link>
        }
      >
        Contact us and we will let you know when you can refill numbers here.
      </EmptyState>
    )
  }
  return <RefillBuilder catalog={plans} callingCents={terms.calling_price_cents} availableCents={wallet.available_cents} />
}
