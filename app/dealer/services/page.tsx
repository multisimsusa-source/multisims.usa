import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { WrenchIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { FormSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { requireRole } from "@/lib/auth"
import { getWallet } from "@/lib/dealers"
import { getServiceOffers } from "@/lib/services"
import { createClient } from "@/lib/supabase/server"
import { ServiceBuilder, type DealerServiceOffer } from "./service-builder"

export const metadata: Metadata = { title: "Services" }

export default function DealerServicesPage() {
  return (
    <>
      <AdminPageHeader
        title="Services"
        description="A QR code or a new number for lines your customers already have. Paste the numbers; each one is charged only once it is done."
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
  const [offers, wallet] = await Promise.all([getServiceOffers(), getWallet(supabase, profile.id)])
  const forDealers: DealerServiceOffer[] = offers
    .filter((o) => o.wholesale_price_cents !== null)
    .map((o) => ({
      carrier_id: o.carrier_id,
      carrier_name: o.carrier_name,
      service_code: o.service_code,
      service_name: o.service_name,
      description: o.description,
      price_cents: o.wholesale_price_cents!,
    }))

  if (!forDealers.length) {
    return (
      <EmptyState
        icon={<WrenchIcon />}
        title="No services yet"
        action={
          <Link href="/dealer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to overview
          </Link>
        }
      >
        QR codes and number changes are not open for your account yet. Contact us and we will let you know when they are.
      </EmptyState>
    )
  }
  return <ServiceBuilder offers={forDealers} availableCents={wallet.available_cents} />
}
