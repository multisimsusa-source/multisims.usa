import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon, ReceiptIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { BatchList } from "@/components/dealer/batch-list"
import { EmptyState } from "@/components/patterns/empty-state"
import { requireRole } from "@/lib/auth"
import { listBatches } from "@/lib/dealer-orders"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Orders" }

export default function DealerOrdersPage() {
  return (
    <>
      <AdminPageHeader
        title="Orders"
        description="Every bulk order you placed. Open one for its SIMs, QR codes and tracking."
        actions={
          <Link href="/dealer/new" className={buttonVariants({ size: "lg" })}>
            <PlusIcon weight="bold" data-icon="inline-start" />
            New order
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <Orders />
      </Suspense>
    </>
  )
}

async function Orders() {
  const profile = await requireRole("dealer")
  const batches = await listBatches(await createClient(), profile.id, 200)
  if (!batches.length) {
    return (
      <EmptyState icon={<ReceiptIcon />} title="No orders yet" action={<Link href="/dealer/new" className={buttonVariants({ variant: "outline", size: "lg" })}>Place your first order</Link>}>
        Your orders show here with how many SIMs are live.
      </EmptyState>
    )
  }
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        <span className="tabular">{batches.length}</span> {batches.length === 1 ? "order" : "orders"}
      </p>
      <BatchList batches={batches} />
    </>
  )
}
