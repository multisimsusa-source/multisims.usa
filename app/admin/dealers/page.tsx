import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { StorefrontIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { Tag } from "@/components/patterns/tag"
import { getWallet, type DealerWithLogin } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { formatDateTime } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import { NewDealerButton } from "./dealer-controls"

export const metadata: Metadata = { title: "Dealers" }

export default function DealersPage() {
  return (
    <>
      <AdminPageHeader
        title="Dealers"
        description="Wholesale buyers who order in bulk from the dealer portal. They pay from a balance: you add funds by hand, or they top up in crypto."
        actions={<NewDealerButton />}
      />
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <DealerList />
      </Suspense>
    </>
  )
}

async function DealerList() {
  const supabase = await createClient()
  const [{ data }, { data: batches }] = await Promise.all([
    supabase
      .from("dealers")
      .select("*, profile:profiles!inner(full_name, email, active)")
      .order("company"),
    supabase.from("order_batches").select("dealer_id, created_at").order("created_at", { ascending: false }).limit(1000),
  ])
  const dealers = (data ?? []) as DealerWithLogin[]

  if (!dealers.length) {
    return (
      <EmptyState icon={<StorefrontIcon />} title="No dealers yet" action={<NewDealerButton />}>
        Create a login for each wholesale buyer. Then set their prices and add funds, and they can order.
      </EmptyState>
    )
  }

  const lastOrder = new Map<string, string>()
  for (const b of batches ?? []) if (!lastOrder.has(b.dealer_id)) lastOrder.set(b.dealer_id, b.created_at)
  const wallets = await Promise.all(dealers.map((d) => getWallet(supabase, d.profile_id)))

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {dealers.map((d, i) => {
        const wallet = wallets[i]
        const last = lastOrder.get(d.profile_id)
        return (
          <li key={d.profile_id} className="relative flex flex-col gap-3 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                <Link href={`/admin/dealers/${d.profile_id}`} className="truncate after:absolute after:inset-0 hover:underline">
                  {d.company}
                </Link>
                {!d.profile.active ? <Tag tone="warning">Suspended</Tag> : null}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {d.profile.full_name} &middot; {d.profile.email}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4 text-sm sm:flex sm:gap-8">
              <div>
                <dt className="text-muted-foreground">Available</dt>
                <dd className="font-mono font-medium tabular">{formatPrice(wallet.available_cents)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Held</dt>
                <dd className="font-mono tabular">{formatPrice(wallet.reserved_cents)}</dd>
              </div>
              <div className="sm:w-32">
                <dt className="text-muted-foreground">Last order</dt>
                <dd className="tabular">{last ? formatDateTime(last) : "None yet"}</dd>
              </div>
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
