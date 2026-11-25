import "server-only"

import { cacheLife, cacheTag } from "next/cache"

import { CATALOG_LIFE, CATALOG_TAG } from "@/lib/catalog"
import { createServiceClient } from "@/lib/supabase/service"
import type { ServiceCode } from "@/lib/types"

/**
 * Services on a line the customer already has (an eSIM QR code, a number change), priced
 * per carrier by the owner. Only active services of active carriers are offered.
 */

export type ServiceOffer = {
  carrier_id: string
  carrier_name: string
  carrier_slug: string
  service_code: ServiceCode
  service_name: string
  description: string
  /** What the website customer pays. */
  price_cents: number
  /** What dealers pay; null when not offered to dealers. */
  wholesale_price_cents: number | null
}

type Row = {
  carrier_id: string
  service_code: ServiceCode
  price_cents: number
  wholesale_price_cents: number | null
  carrier: { name: string; slug: string; active: boolean; display_order: number }
  service: { name: string; description: string; display_order: number }
}

async function readOffers(): Promise<ServiceOffer[]> {
  const { data, error } = await createServiceClient()
    .from("carrier_services")
    .select(
      "carrier_id, service_code, price_cents, wholesale_price_cents, carrier:carriers!inner(name, slug, active, display_order), service:services!inner(name, description, display_order)"
    )
    .eq("active", true)
  if (error) throw error
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.carrier.active)
    .sort(
      (a, b) =>
        a.service.display_order - b.service.display_order ||
        a.carrier.display_order - b.carrier.display_order ||
        a.carrier.name.localeCompare(b.carrier.name)
    )
    .map((r) => ({
      carrier_id: r.carrier_id,
      carrier_name: r.carrier.name,
      carrier_slug: r.carrier.slug,
      service_code: r.service_code,
      service_name: r.service.name,
      description: r.service.description,
      price_cents: r.price_cents,
      wholesale_price_cents: r.wholesale_price_cents,
    }))
}

/** What the website offers, cached with the catalogue. */
export async function getServiceOffers(): Promise<ServiceOffer[]> {
  "use cache"
  cacheLife(CATALOG_LIFE)
  cacheTag(CATALOG_TAG)
  return readOffers()
}

/** At order time: read fresh, never from the cache. */
export async function findServiceOffer(carrierId: string, code: string): Promise<ServiceOffer | null> {
  const offers = await readOffers()
  return offers.find((o) => o.carrier_id === carrierId && o.service_code === code) ?? null
}

/** The services and their wording, for labels. */
export const serviceShortName: Record<ServiceCode, string> = {
  esim_qr: "eSIM QR code",
  number_change: "Number change",
}
