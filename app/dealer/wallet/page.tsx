import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { WalletLedger } from "@/components/dealer/wallet-ledger"
import { WalletSummary } from "@/components/dealer/wallet-summary"
import { Notice } from "@/components/patterns/notice"
import { Tag } from "@/components/patterns/tag"
import { requireRole } from "@/lib/auth"
import { getWallet, listLedger } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { formatDateTime } from "@/lib/orders"
import {
  minimumOrderCents,
  paymentsEnabled,
  TOPUP_MIN_CENTS,
} from "@/lib/payments"
import { createClient } from "@/lib/supabase/server"
import { TopUpForm } from "./top-up-form"

/** Top-ups started in the last two days that have not been credited yet. */
function listOpenTopUps(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase
    .from("payments")
    .select("id, price_cents, status, created_at")
    .eq("kind", "wallet_topup")
    .in("status", ["awaiting", "confirming", "partially_paid"])
    .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
}

export const metadata: Metadata = { title: "Wallet" }

export default function WalletPage({
  searchParams,
}: PageProps<"/dealer/wallet">) {
  return (
    <>
      <AdminPageHeader
        title="Wallet"
        description="Your balance pays for orders. It is held when you order and taken as each SIM is delivered; anything not delivered comes back."
      />
      <Suspense fallback={<FormSkeleton sections={2} />}>
        <Wallet searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Wallet({
  searchParams,
}: Pick<PageProps<"/dealer/wallet">, "searchParams">) {
  const [profile, query] = await Promise.all([
    requireRole("dealer"),
    searchParams,
  ])
  const supabase = await createClient()
  const [wallet, ledger, { data: pending }] = await Promise.all([
    getWallet(supabase, profile.id),
    listLedger(supabase, profile.id, 300),
    listOpenTopUps(supabase),
  ])
  const canTopUp = paymentsEnabled()
  const minimum = canTopUp
    ? await minimumOrderCents(TOPUP_MIN_CENTS)
    : TOPUP_MIN_CENTS

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        {query.topup === "sent" ? (
          <Notice tone="success" title="Payment sent">
            Your balance goes up as soon as the payment is confirmed on the
            network. That usually takes a few minutes, sometimes up to an hour.
          </Notice>
        ) : null}
        <WalletSummary wallet={wallet} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section
          aria-labelledby="history-title"
          className="flex min-w-0 flex-col gap-4 max-lg:order-2"
        >
          <h2 id="history-title" className="type-section-title">
            History
          </h2>
          <WalletLedger
            entries={ledger}
            emptyText="Nothing yet. Top up or ask us to add funds to start ordering."
          />
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <section
            aria-labelledby="topup-title"
            className="rounded-xl border bg-card p-5"
          >
            <h2 id="topup-title" className="type-card-title">
              Top up in crypto
            </h2>
            {canTopUp ? (
              <div className="mt-4">
                <TopUpForm minimumCents={minimum} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Crypto top-up opens soon. Until then, pay us directly and we add
                the funds for you.
              </p>
            )}
          </section>
          {pending?.length ? (
            <section
              aria-labelledby="pending-title"
              className="rounded-xl border bg-background p-5"
            >
              <h2 id="pending-title" className="type-overline">
                Top-ups on their way
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {pending.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="tabular text-muted-foreground">
                      {formatDateTime(p.created_at)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular font-mono">
                        {formatPrice(p.price_cents)}
                      </span>
                      <Tag
                        tone={
                          p.status === "partially_paid" ? "warning" : "brand"
                        }
                      >
                        {p.status === "awaiting"
                          ? "Not paid"
                          : p.status === "confirming"
                            ? "Confirming"
                            : "Short, we will check"}
                      </Tag>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Paid us another way? Message us and we add it to your balance by
            hand.
          </p>
        </aside>
      </div>
    </div>
  )
}
