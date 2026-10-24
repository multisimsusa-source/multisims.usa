import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"
import { z } from "zod"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { KeyValue, Panel } from "@/components/patterns/panel"
import { Tag } from "@/components/patterns/tag"
import { WalletLedger } from "@/components/dealer/wallet-ledger"
import { WalletSummary } from "@/components/dealer/wallet-summary"
import { batchLabel, getWallet, listLedger, type DealerWithLogin } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { formatDateTime } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import { DealerAccountForm, DealerActiveSwitch, DealerPasswordButton, DealerPricesForm, WalletEntryButton, type PriceRow } from "../dealer-controls"

export const metadata: Metadata = { title: "Dealer" }

export default function DealerPage({ params }: PageProps<"/admin/dealers/[id]">) {
  return (
    <>
      <Link href="/admin/dealers" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon aria-hidden />
        Dealers
      </Link>
      <Suspense fallback={<FormSkeleton sections={3} />}>
        <DealerDetail params={params} />
      </Suspense>
    </>
  )
}

async function DealerDetail({ params }: Pick<PageProps<"/admin/dealers/[id]">, "params">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createClient()
  const { data } = await supabase.from("dealers").select("*, profile:profiles!inner(full_name, email, active)").eq("profile_id", id).maybeSingle()
  if (!data) notFound()
  const dealer = data as DealerWithLogin

  const [wallet, ledger, { data: settings }, { data: packages }, { data: overrides }, { data: batches }] = await Promise.all([
    getWallet(supabase, id),
    listLedger(supabase, id, 100),
    supabase.from("settings").select("dealer_sim_card_price_cents").eq("id", true).single(),
    supabase
      .from("day_packages")
      .select("id, days, price_cents, wholesale_price_cents, active, plan:plans!inner(name, product_type, display_order, published, carrier:carriers!inner(name, display_order))")
      .eq("active", true)
      .order("days"),
    supabase.from("dealer_prices").select("day_package_id, price_cents").eq("dealer_id", id),
    supabase.from("order_batches").select("id, number, total_cents, created_at").eq("dealer_id", id).order("created_at", { ascending: false }).limit(5),
  ])

  const override = new Map((overrides ?? []).map((o) => [o.day_package_id as string, o.price_cents as number]))
  type PackageRow = {
    id: string
    days: number
    price_cents: number
    wholesale_price_cents: number | null
    plan: { name: string; product_type: "esim" | "physical"; display_order: number; published: boolean; carrier: { name: string; display_order: number } }
  }
  const rows: PriceRow[] = ((packages ?? []) as unknown as PackageRow[])
    .filter((p) => p.plan.published)
    .sort(
      (a, b) =>
        a.plan.carrier.display_order - b.plan.carrier.display_order ||
        a.plan.carrier.name.localeCompare(b.plan.carrier.name) ||
        a.plan.display_order - b.plan.display_order ||
        a.plan.name.localeCompare(b.plan.name) ||
        a.days - b.days
    )
    .map((p) => ({
      packageId: p.id,
      carrier: p.plan.carrier.name,
      plan: p.plan.name,
      productType: p.plan.product_type,
      days: p.days,
      retailCents: p.price_cents,
      wholesaleCents: p.wholesale_price_cents,
      dealerCents: override.get(p.id) ?? null,
    }))

  const name = dealer.profile.full_name || dealer.profile.email

  return (
    <>
      <AdminPageHeader
        title={dealer.company}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {dealer.profile.active ? null : <Tag tone="warning">Suspended</Tag>}
            <span>
              {name} &middot; {dealer.profile.email}
              {dealer.phone ? ` · ${dealer.phone}` : ""}
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <DealerPasswordButton dealerId={id} name={name} />
            <DealerActiveSwitch dealerId={id} active={dealer.profile.active} name={dealer.company} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="wallet-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="wallet-title" className="type-section-title">
                  Wallet
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Every movement is kept with who made it. The balance is worked out from these lines and never typed in.</p>
              </div>
              <div className="flex gap-2">
                <WalletEntryButton dealerId={id} company={dealer.company} mode="add" />
                <WalletEntryButton dealerId={id} company={dealer.company} mode="correct" />
              </div>
            </div>
            <WalletSummary wallet={wallet} />
            <WalletLedger entries={ledger} emptyText="No movements yet. Add funds to let this dealer order." />
          </section>

          <section aria-labelledby="prices-title" className="flex flex-col gap-4">
            <div>
              <h2 id="prices-title" className="type-section-title">
                Prices
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This dealer pays the wholesale price unless you set a special price here. A package with neither is not offered to dealers.
              </p>
            </div>
            <DealerPricesForm dealerId={id} rows={rows} />
          </section>

          <section aria-labelledby="account-title" className="flex flex-col gap-4">
            <h2 id="account-title" className="type-section-title">
              Account
            </h2>
            <DealerAccountForm dealer={dealer} defaultSimCents={settings?.dealer_sim_card_price_cents ?? 0} />
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Panel title="Recent orders">
            {batches?.length ? (
              batches.map((b) => (
                <KeyValue
                  key={b.id}
                  label={`${batchLabel(b.number)} · ${formatDateTime(b.created_at)}`}
                  value={formatPrice(b.total_cents)}
                  mono
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            )}
            {batches?.length ? (
              <Link href={`/admin/orders?dealer=${id}`} className="mt-2 text-sm font-medium text-brand hover:underline">
                All orders from this dealer
              </Link>
            ) : null}
          </Panel>
          <Panel title="Login">
            <KeyValue label="Status" value={dealer.profile.active ? "Can sign in" : "Suspended"} />
            <KeyValue label="Since" value={formatDateTime(dealer.created_at)} />
          </Panel>
        </aside>
      </div>
    </>
  )
}
