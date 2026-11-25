import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { WrenchIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/patterns/empty-state"
import { Container } from "@/components/site/section"
import { getCustomerOrder } from "@/lib/customer-order"
import { minimumOrderCents, paymentsEnabled } from "@/lib/payments"
import { getServiceOffers } from "@/lib/services"
import { createServiceClient } from "@/lib/supabase/service"
import type { ServiceCode } from "@/lib/types"
import { ServiceForm, type ServicePrefill, type WebServiceOffer } from "./service-form"

export const metadata: Metadata = {
  title: "eSIM QR code or a new number",
  description: "Get a QR code to put your US line on an eSIM, or a new number on the same line. The fee is shown before you pay.",
  alternates: { canonical: "/services" },
}

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default function ServicesPage({ searchParams }: Params) {
  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-3xl font-semibold sm:text-4xl">QR code or new number</h1>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">
        For a US line you already have: a QR code to install it as an eSIM, or a new phone number on the same line. You
        see the fee before you pay. No account needed.
      </p>
      <Suspense fallback={<ServicesSkeleton />}>
        <Services searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}

async function Services({ searchParams }: Params) {
  const params = await searchParams
  const [all, fees] = await Promise.all([getServiceOffers(), getFees()])
  // A fee under the website minimum cannot be paid in crypto: those stay for dealers only.
  const offers: WebServiceOffer[] = all.filter((o) => o.price_cents + fees.networkFeeCents >= fees.minimumCents).map((o) => ({
    carrier_id: o.carrier_id,
    carrier_name: o.carrier_name,
    service_code: o.service_code,
    service_name: o.service_name,
    price_cents: o.price_cents,
  }))

  if (!offers.length) {
    return (
      <EmptyState
        className="mt-8"
        icon={<WrenchIcon />}
        title="Not available yet"
        action={
          <Link href="/contact" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Contact us
          </Link>
        }
      >
        Message us with your number and what you need, and we will help you.
      </EmptyState>
    )
  }

  const service = params.service === "esim_qr" || params.service === "number_change" ? (params.service as ServiceCode) : undefined
  let prefill: ServicePrefill = { service }
  // From an order page: the buyer holds that page's private link, so its details can fill the form.
  const token = typeof params.from === "string" ? params.from : ""
  const itemId = typeof params.item === "string" ? params.item : ""
  if (token && itemId) {
    const data = await getCustomerOrder(token)
    const item = data?.items.find((i) => i.id === itemId)
    if (data && item) {
      prefill = {
        service,
        carrier_id: offers.find((o) => o.carrier_name === data.order.carrier_name)?.carrier_id,
        line_phone: item.phone_number ?? undefined,
        iccid: item.iccid ?? undefined,
        name: data.order.customer_name,
        email: data.order.customer_email,
        phone: data.order.customer_phone,
      }
    }
  }

  return (
    <div className="mt-8">
      <ServiceForm offers={offers} prefill={prefill} fees={fees} takesPayment={paymentsEnabled()} />
    </div>
  )
}

async function getFees() {
  const { data } = await createServiceClient().from("settings").select("network_fee_cents, min_order_cents").maybeSingle()
  return {
    networkFeeCents: data?.network_fee_cents ?? 0,
    minimumCents: await minimumOrderCents(data?.min_order_cents ?? 0),
  }
}

function ServicesSkeleton() {
  return (
    <div aria-hidden className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem] lg:gap-10">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-64 rounded-xl max-lg:-order-1" />
    </div>
  )
}
