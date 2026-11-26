import type { Metadata } from "next"
import { Suspense } from "react"
import { WrenchIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { formatPrice } from "@/lib/format"
import { minimumOrderCents } from "@/lib/payments"
import { createClient } from "@/lib/supabase/server"
import { ServiceRow } from "./service-row"

export const metadata: Metadata = { title: "Services" }

export default function ServicesPage() {
  return (
    <>
      <AdminPageHeader
        title="Services"
        description="Services on a line the customer already has, with a price for each carrier. Website customers pay when they ask. Dealers have it held on their wallet and taken for each number once it is done. The dealer price applies to every dealer; give one dealer their own price on their page under Dealers. With neither, a service is not offered to that dealer."
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <ServiceTables />
      </Suspense>
    </>
  )
}

type Service = { code: string; name: string; description: string }
type Offer = { carrier_id: string; service_code: string; price_cents: number; wholesale_price_cents: number | null; active: boolean }

async function ServiceTables() {
  const supabase = await createClient()
  const [{ data: services }, { data: carriers }, { data: offers }, { data: settings }] = await Promise.all([
    supabase.from("services").select("code, name, description").order("display_order"),
    supabase.from("carriers").select("id, name, active").eq("active", true).order("display_order").order("name"),
    supabase.from("carrier_services").select("carrier_id, service_code, price_cents, wholesale_price_cents, active"),
    supabase.from("settings").select("min_order_cents").maybeSingle(),
  ])
  // Crypto payments have a floor: a website customer cannot pay less than this.
  const minimum = await minimumOrderCents(settings?.min_order_cents ?? 0)
  if (!carriers?.length) {
    return (
      <EmptyState icon={<WrenchIcon />} title="No active carriers">
        Add a carrier under Carriers first.
      </EmptyState>
    )
  }
  const offer = new Map(((offers ?? []) as Offer[]).map((o) => [`${o.carrier_id}:${o.service_code}`, o]))

  return (
    <div className="flex flex-col gap-8">
      {minimum > 0 ? (
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          Website orders are at least {formatPrice(minimum)} (the minimum order in Settings, and the crypto payment
          minimum). A customer price below that can only be ordered by dealers.
        </p>
      ) : null}
      {((services ?? []) as Service[]).map((s) => (
        <section key={s.code} aria-labelledby={`service-${s.code}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`service-${s.code}`} className="type-section-title">
              {s.name}
            </h2>
            <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{s.description}</p>
          </div>
          <div className="divide-y rounded-xl border bg-background">
            {carriers.map((c) => {
              const o = offer.get(`${c.id}:${s.code}`)
              return (
                <ServiceRow
                  key={c.id}
                  carrierId={c.id}
                  carrierName={c.name}
                  service={s.code}
                  serviceName={s.name}
                  price={o?.price_cents ?? null}
                  wholesale={o?.wholesale_price_cents ?? null}
                  active={o?.active ?? false}
                  minimumCents={minimum}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
