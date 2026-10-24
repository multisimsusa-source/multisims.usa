import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon, ReceiptIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton, OverviewSkeleton } from "@/components/admin/skeletons"
import { BatchList } from "@/components/dealer/batch-list"
import { WalletSummary } from "@/components/dealer/wallet-summary"
import { EmptyState } from "@/components/patterns/empty-state"
import { Notice } from "@/components/patterns/notice"
import { requireRole } from "@/lib/auth"
import { listBatches } from "@/lib/dealer-orders"
import { getWallet } from "@/lib/dealers"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Overview" }

export default function DealerOverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  )
}

async function Overview() {
  const profile = await requireRole("dealer")
  const supabase = await createClient()
  const [{ data: dealer }, wallet] = await Promise.all([
    supabase
      .from("dealers")
      .select("company")
      .eq("profile_id", profile.id)
      .maybeSingle(),
    getWallet(supabase, profile.id),
  ])

  return (
    <>
      <AdminPageHeader
        title={dealer?.company ?? "Dealer portal"}
        description="Order eSIMs and SIM cards in bulk at your prices. Orders are paid from your balance."
        actions={
          <Link href="/dealer/new" className={buttonVariants({ size: "lg" })}>
            <PlusIcon weight="bold" data-icon="inline-start" />
            New order
          </Link>
        }
      />
      <div className="flex flex-col gap-4">
        <WalletSummary wallet={wallet} />
        {wallet.available_cents <= 0 ? (
          <Notice tone="info" title="Add funds to order">
            Top up in crypto from{" "}
            <Link
              href="/dealer/wallet"
              className="font-medium underline underline-offset-3"
            >
              Wallet
            </Link>
            , or ask us to add funds for a payment you made to us directly.
          </Notice>
        ) : null}
      </div>

      <section aria-labelledby="recent-title" className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="recent-title" className="type-section-title">
            Recent orders
          </h2>
          <Link
            href="/dealer/orders"
            className="text-sm font-medium text-brand hover:underline"
          >
            All orders
          </Link>
        </div>
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <Recent dealerId={profile.id} />
        </Suspense>
      </section>
    </>
  )
}

async function Recent({ dealerId }: { dealerId: string }) {
  const batches = await listBatches(await createClient(), dealerId, 5)
  if (!batches.length) {
    return (
      <EmptyState
        icon={<ReceiptIcon />}
        title="No orders yet"
        action={
          <Link
            href="/dealer/new"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Place your first order
          </Link>
        }
      >
        Mix any plans in one order, each with its own quantity.
      </EmptyState>
    )
  }
  return <BatchList batches={batches} />
}
