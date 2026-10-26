import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { listCarriers } from "@/lib/admin/queries"
import { CarrierDialog } from "./carrier-dialog"
import { CarrierList } from "./carrier-list"
import { SimCardPrices, type AdminSimCard } from "./sim-cards"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Carriers" }

export default function CarriersPage() {
  return (
    <>
      <AdminPageHeader
        title="Carriers"
        description="Carriers appear in the logo strip on the home page in this order. Hiding a carrier hides all of its plans."
        actions={<CarrierDialog mode="create" />}
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Carriers />
      </Suspense>
      <section aria-labelledby="sim-cards" className="mt-10">
        <h2 id="sim-cards" className="type-section-title">
          SIM cards
        </h2>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          Each carrier&apos;s SIM card. The price is charged on every SIM card order, with or without a plan. Switch on
          &quot;On sale&quot; to sell the card on its own; it shows with its price and no length. Dealers pay the dealer
          price unless their own page sets another; leave it empty to not offer the card to dealers.
        </p>
        <div className="mt-4">
          <Suspense fallback={<ListSkeleton rows={4} />}>
            <SimCards />
          </Suspense>
        </div>
      </section>
    </>
  )
}

async function Carriers() {
  const carriers = await listCarriers()
  return <CarrierList carriers={carriers} />
}

async function SimCards() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("carriers")
    .select("id, name, display_order, card:sim_cards ( price_cents, wholesale_price_cents, active )")
    .order("display_order")
    .order("name")
  type Card = { price_cents: number; wholesale_price_cents: number | null; active: boolean }
  const cards: AdminSimCard[] = (data ?? []).map((c) => {
    const raw = c.card as unknown as Card | Card[] | null
    const card = Array.isArray(raw) ? raw[0] : raw
    return {
      carrier_id: c.id,
      carrier_name: c.name,
      price_cents: card?.price_cents ?? null,
      wholesale_price_cents: card?.wholesale_price_cents ?? null,
      active: card?.active ?? false,
    }
  })
  return cards.length ? <SimCardPrices cards={cards} /> : <p className="text-sm text-muted-foreground">Add a carrier first.</p>
}
