import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { Tag } from "@/components/patterns/tag"
import { FormSkeleton } from "@/components/admin/skeletons"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminPlan, hiddenReason, listCarriers } from "@/lib/admin/queries"
import { PlanCard } from "@/components/site/plan-card"
import { productTypeLabel } from "@/lib/format"
import type { CatalogPlan } from "@/lib/types"
import { cn } from "@/lib/utils"
import { PlanForm } from "../plan-form"
import { DayPackages } from "./day-packages"
import { DeletePlan } from "./delete-plan"

export const metadata: Metadata = { title: "Edit plan" }

export default function EditPlanPage({ params }: PageProps<"/admin/plans/[id]">) {
  return (
    <>
      <Link href="/admin/plans" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:hidden">
        <ArrowLeftIcon className="size-4" />
        Plans
      </Link>
      <Suspense
        fallback={
          <div aria-hidden>
            <div className="mb-8 space-y-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-48" />
            </div>
            <FormSkeleton sections={3} />
          </div>
        }
      >
        <PlanEditor params={params} />
      </Suspense>
    </>
  )
}

async function PlanEditor({ params }: Pick<PageProps<"/admin/plans/[id]">, "params">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [plan, carriers] = await Promise.all([getAdminPlan(id), listCarriers()])
  if (!plan) notFound()

  const reason = hiddenReason(plan)
  const onSale = plan.packages.filter((p) => p.active)
  const preview: CatalogPlan | null = onSale.length
    ? {
        ...plan,
        carrier: plan.carrier,
        packages: onSale.map(({ id, days, price_cents }) => ({ id, days, price_cents })),
        from_price_cents: Math.min(...onSale.map((p) => p.price_cents)),
      }
    : null

  return (
    <>
      <AdminPageHeader
        title={plan.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {plan.carrier.name} {productTypeLabel[plan.product_type]}
            <Tag tone={reason ? "warning" : "success"}>{reason ?? "Live on website"}</Tag>
          </span>
        }
        actions={
          reason ? null : (
            <Link
              href={`/plans/${plan.slug}`}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline" }), "h-10")}
            >
              View on site
              <ArrowSquareOutIcon data-icon="inline-end" />
            </Link>
          )
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <DayPackages planId={plan.id} packages={plan.packages} />
          <PlanForm carriers={carriers} plan={plan} />
          <DeletePlan id={plan.id} name={plan.name} />
        </div>

        {/* Wide screens: what customers see, beside the fields that change it. */}
        <aside aria-label="On the website" className="hidden flex-col gap-4 xl:sticky xl:top-20 xl:flex">
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">On the website</p>
            <p className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", reason ? "text-warning-ink" : "text-success-ink")}>
              <span aria-hidden className={cn("size-1.5 rounded-full", reason ? "bg-warning-ink" : "bg-success-ink")} />
              {reason ?? "Live"}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">{statusHelp(reason)}</p>
          </div>
          {preview ? (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Card preview, as last saved</p>
              {/* Inert: a picture of the card, not a second way to leave the editor. */}
              <div inert className="select-none">
                <PlanCard plan={preview} />
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  )
}

function statusHelp(reason: string | null) {
  if (reason === "Withdrawn") return "Switch Published on and save to put it back on sale."
  if (reason === "Carrier hidden") return "Its carrier is hidden. Show the carrier on the Carriers page."
  if (reason === "No day packages") return "Put at least one day package on sale."
  return "Customers can find and buy this plan now."
}
