import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { PercentIcon } from "@phosphor-icons/react/ssr"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { EmptyState } from "@/components/patterns/empty-state"
import { Tag } from "@/components/patterns/tag"
import { formatPrice } from "@/lib/format"
import { formatDateTime, type Tone } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import { DeleteDiscountButton, DiscountActiveSwitch, NewDiscountButton } from "./discount-controls"

export const metadata: Metadata = { title: "Discounts" }

type Code = {
  id: string
  code: string
  kind: "percent" | "fixed"
  value: number
  starts_at: string | null
  ends_at: string | null
  max_uses: number | null
  uses: number
  active: boolean
  note: string
  carrier: { name: string } | null
}

export default function DiscountsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Discounts />
    </Suspense>
  )
}

/** Where a code stands right now, in words. */
function codeState(c: Code, now: number): { label: string; tone: Tone } {
  if (!c.active) return { label: "Off", tone: "neutral" }
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return { label: "Ended", tone: "neutral" }
  if (c.max_uses !== null && c.uses >= c.max_uses) return { label: "Used up", tone: "neutral" }
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Scheduled", tone: "brand" }
  return { label: "Live", tone: "success" }
}

/** Each code with where it stands at this moment. */
function withState(codes: Code[]) {
  const now = Date.now()
  return codes.map((c) => ({ ...c, state: codeState(c, now) }))
}

async function Discounts() {
  const supabase = await createClient()
  const [{ data }, { data: carriers }] = await Promise.all([
    supabase
      .from("discount_codes")
      .select("id, code, kind, value, starts_at, ends_at, max_uses, uses, active, note, carrier:carriers ( name )")
      .order("created_at", { ascending: false }),
    supabase.from("carriers").select("id, name").order("display_order").order("name"),
  ])
  await connection()
  const codes = withState((data ?? []) as unknown as Code[])

  return (
    <>
      <AdminPageHeader
        title="Discounts"
        description="Codes customers type at checkout. Website orders only; never on shipping or the network fee. The minimum order is checked after the discount."
        actions={<NewDiscountButton carriers={carriers ?? []} />}
      />
      {codes.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-background">
          {codes.map((c) => {
            const state = c.state
            return (
              <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold tabular">{c.code}</span>
                    <Tag tone={state.tone}>{state.label}</Tag>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {c.kind === "percent" ? `${c.value}% off` : `${formatPrice(c.value)} off`}
                    {c.carrier ? `, ${c.carrier.name} only` : ", any carrier"}
                    {c.starts_at ? `, from ${formatDateTime(c.starts_at)}` : ""}
                    {c.ends_at ? `, until ${formatDateTime(c.ends_at)}` : ""}
                    {c.note ? `. ${c.note}` : ""}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground sm:w-28 sm:text-right">
                  <span className="font-mono text-foreground tabular">{c.uses}</span>
                  {c.max_uses !== null ? (
                    <>
                      {" "}
                      of <span className="font-mono tabular">{c.max_uses}</span>
                    </>
                  ) : null}{" "}
                  used
                </p>
                <div className="flex items-center gap-2">
                  <DiscountActiveSwitch id={c.id} code={c.code} active={c.active} />
                  {c.uses === 0 ? <DeleteDiscountButton id={c.id} code={c.code} /> : <span className="size-10" aria-hidden />}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState icon={<PercentIcon />} title="No discount codes yet" action={<NewDiscountButton carriers={carriers ?? []} />}>
          Create a code for a promotion. Customers enter it under &quot;Have a discount code?&quot; at checkout.
        </EmptyState>
      )}
    </>
  )
}
