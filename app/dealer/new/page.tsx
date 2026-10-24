import type { Metadata } from "next"
import { TagIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { requireRole } from "@/lib/auth"
import { getDealerCatalog, getOrderingTerms } from "@/lib/dealer-orders"
import { getWallet } from "@/lib/dealers"
import { createClient } from "@/lib/supabase/server"
import { OrderBuilder } from "./order-builder"

export const metadata: Metadata = { title: "New order" }

export default function NewDealerOrderPage() {
  return (
    <>
      <AdminPageHeader
        title="New order"
        description="Mix any plans in one order, each line with its own quantity. The total is taken from your balance as each SIM is delivered."
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
  const [catalog, terms, wallet] = await Promise.all([
    getDealerCatalog(supabase),
    getOrderingTerms(profile.id),
    getWallet(supabase, profile.id),
  ])

  if (!catalog.length) {
    return (
      <EmptyState
        icon={<TagIcon />}
        title="No plans are priced for you yet"
        action={
          <Link
            href="/dealer"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Back to overview
          </Link>
        }
      >
        We are setting up your prices. Contact us and we will let you know when
        you can order.
      </EmptyState>
    )
  }
  return (
    <OrderBuilder
      catalog={catalog}
      terms={terms}
      availableCents={wallet.available_cents}
    />
  )
}
