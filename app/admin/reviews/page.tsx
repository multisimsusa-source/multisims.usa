import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { StarIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { Stars } from "@/components/patterns/star-rating"
import { Tag } from "@/components/patterns/tag"
import { UrlFilters } from "@/components/staff/url-filters"
import { formatDateTime, orderLabel } from "@/lib/orders"
import type { ProductType } from "@/lib/types"
import { createClient } from "@/lib/supabase/server"
import { FeatureSwitch, HideButton } from "./review-controls"
import { orderTitle } from "@/lib/format"

export const metadata: Metadata = { title: "Reviews" }

type Row = {
  id: string
  rating: number
  comment: string
  display_name: string
  featured: boolean
  hidden: boolean
  created_at: string
  updated_at: string | null
  order_item_id: string | null
  item: { seq: number } | null
  order: {
    id: string
    number: number
    carrier_name: string
    plan_name: string
    product_type: ProductType
    channel: "website" | "dealer"
    replaces_item_id: string | null
  }
}

/** What the review is of: the whole order, or one SIM on it. */
function subjectOf(r: Row) {
  if (!r.order_item_id) return r.order.channel === "dealer" ? "Whole line" : "Whole order"
  const unit = r.order.product_type === "esim" ? "eSIM" : "SIM card"
  return r.order.replaces_item_id ? `Replacement ${unit}` : `${unit} ${r.item?.seq ?? ""}`.trim()
}

const SHOW = ["all", "featured", "new", "hidden"] as const
const FROM = ["all", "website", "dealer"] as const

export default function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return (
    <>
      <AdminPageHeader
        title="Reviews"
        description="Customers and dealers rate orders and single SIMs, and may change a rating later. Switch on Featured for the customer reviews to show on the website; a changed review comes off until you feature it again. Dealer ratings are never shown. The website never shows an average or a count."
      />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <Reviews searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Reviews({ searchParams }: Pick<PageProps<"/admin/reviews">, "searchParams">) {
  const raw = await searchParams
  const params = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>
  const show = SHOW.includes(params.show as (typeof SHOW)[number]) ? (params.show as (typeof SHOW)[number]) : "all"
  const stars = /^[1-5]$/.test(params.stars ?? "") ? Number(params.stars) : null
  const from = FROM.includes(params.from as (typeof FROM)[number]) ? (params.from as (typeof FROM)[number]) : "all"

  const supabase = await createClient()
  let query = supabase
    .from("reviews")
    .select(
      "id, rating, comment, display_name, featured, hidden, created_at, updated_at, order_item_id, item:order_items ( seq ), order:orders!inner ( id, number, carrier_name, plan_name, product_type, channel, replaces_item_id )"
    )
    .order("created_at", { ascending: false })
    .limit(300)
  if (show === "featured") query = query.eq("featured", true)
  else if (show === "new") query = query.eq("featured", false).eq("hidden", false)
  else if (show === "hidden") query = query.eq("hidden", true)
  else query = query.eq("hidden", false)
  if (stars) query = query.eq("rating", stars)
  if (from !== "all") query = query.eq("order.channel", from)
  const { data } = await query
  const reviews = (data ?? []) as unknown as Row[]

  return (
    <div className="flex flex-col gap-4">
      <UrlFilters
        query=""
        placeholder="Search"
        params={params}
        hideSearch
        selects={[
          {
            param: "show",
            label: "Which reviews",
            value: show,
            items: [
              { value: "all", label: "All but hidden" },
              { value: "featured", label: "Featured" },
              { value: "new", label: "Not featured yet" },
              { value: "hidden", label: "Hidden" },
            ],
          },
          {
            param: "from",
            label: "From",
            value: from,
            items: [
              { value: "all", label: "Customers and dealers" },
              { value: "website", label: "Customers" },
              { value: "dealer", label: "Dealers" },
            ],
          },
          {
            param: "stars",
            label: "Stars",
            value: stars ? String(stars) : "all",
            items: [{ value: "all", label: "Any stars" }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "star" : "stars"}` }))],
          },
        ]}
      />
      {reviews.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-background">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Stars rating={r.rating} />
                  <span className="text-sm font-medium">{r.display_name}</span>
                  {r.order.channel === "dealer" ? <Tag tone="brand">Dealer</Tag> : null}
                  <span className="text-sm text-muted-foreground">{subjectOf(r)}</span>
                  {r.featured ? <Tag tone="success">On website</Tag> : null}
                  {r.hidden ? <Tag tone="neutral">Hidden</Tag> : null}
                </p>
                {r.comment ? <p className="mt-2 max-w-[65ch] text-sm whitespace-pre-line">{r.comment}</p> : <p className="mt-2 text-sm text-muted-foreground">No comment.</p>}
                <p className="mt-2 text-sm text-muted-foreground">
                  <Link href={`/admin/orders/${r.order.id}`} className="font-mono text-brand tabular hover:underline">
                    {orderLabel(r.order)}
                  </Link>{" "}
                  {orderTitle(r.order)}, <span className="tabular">{formatDateTime(r.created_at)}</span>
                  {r.updated_at ? (
                    <>
                      , changed <span className="tabular">{formatDateTime(r.updated_at)}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.hidden ? null : r.order.channel === "dealer" ? (
                  <span className="text-sm text-muted-foreground">Not for the website</span>
                ) : (
                  <FeatureSwitch id={r.id} featured={r.featured} name={r.display_name} />
                )}
                <HideButton id={r.id} hidden={r.hidden} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<StarIcon />} title={show === "all" && !stars && from === "all" ? "No reviews yet" : "No reviews match"}>
          {show === "all" && !stars && from === "all"
            ? "Customers rate their order and each SIM from their order page once it is delivered (a SIM card: once it arrives). Dealers rate lines and SIMs from their portal."
            : "Try another filter."}
        </EmptyState>
      )}
    </div>
  )
}
