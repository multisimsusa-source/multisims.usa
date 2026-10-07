"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowDownIcon, ArrowUpIcon, CellTowerIcon, TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ConfirmAction } from "@/components/admin/confirm-action"
import { CarrierLogo } from "@/components/site/carrier-logo"
import type { AdminCarrier } from "@/lib/admin/queries"
import type { ActionResult } from "@/lib/admin/result"
import { bundledCarrierLogo } from "@/lib/carrier-logos"
import { CarrierDialog } from "./carrier-dialog"
import { deleteCarrier, moveCarrier, setCarrierActive } from "./actions"

export function CarrierList({ carriers }: { carriers: AdminCarrier[] }) {
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error)
      else if (result.message) toast.success(result.message)
    })
  }

  if (!carriers.length) {
    return (
      <div className="rounded-xl border border-dashed bg-background p-10 text-center">
        <CellTowerIcon className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">No carriers yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Add a carrier, then create plans under it.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background" aria-busy={pending}>
      {carriers.map((carrier, index) => (
        <li key={carrier.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:flex-nowrap">
          <div className="flex shrink-0 flex-col">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${carrier.name} up`}
              disabled={index === 0 || pending}
              onClick={() => run(() => moveCarrier(carrier.id, "up"))}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${carrier.name} down`}
              disabled={index === carriers.length - 1 || pending}
              onClick={() => run(() => moveCarrier(carrier.id, "down"))}
            >
              <ArrowDownIcon className="size-4" />
            </Button>
          </div>

          {/* The logo the website shows: uploaded, else built-in for known carriers. */}
          <div className="flex w-28 shrink-0 flex-col items-center gap-1">
            <div className="flex h-12 w-full items-center justify-center rounded-md border bg-card px-2">
              <CarrierLogo carrier={carrier} size="sm" />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {carrier.logo_path ? "Uploaded logo" : bundledCarrierLogo(carrier.name) ? "Built-in logo" : "No logo, name shown"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{carrier.name}</p>
            <p className="text-sm text-muted-foreground">
              <Link href={`/admin/plans?carrier=${carrier.id}`} className="hover:text-foreground hover:underline">
                {carrier.plan_count === 1 ? "1 plan" : `${carrier.plan_count} plans`}
              </Link>
              <span className="mx-1.5">/</span>
              <span className="font-mono text-xs">{carrier.slug}</span>
            </p>
          </div>

          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
              <Switch
                checked={carrier.active}
                disabled={pending}
                aria-label={carrier.active ? `Hide ${carrier.name} from the website` : `Show ${carrier.name} on the website`}
                onCheckedChange={(checked) => run(() => setCarrierActive(carrier.id, checked))}
              />
              <span className={carrier.active ? "w-20" : "w-20 text-muted-foreground"}>
                {carrier.active ? "On website" : "Hidden"}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <CarrierDialog mode="edit" carrier={carrier} />
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="icon" aria-label={`Remove ${carrier.name}`}>
                    <TrashIcon className="size-4" />
                  </Button>
                }
                title={`Remove ${carrier.name}?`}
                description={
                  carrier.plan_count
                    ? `This deletes the carrier and its ${carrier.plan_count === 1 ? "plan" : `${carrier.plan_count} plans`}, including their day packages. To take it off the site temporarily, switch it off instead.`
                    : "This deletes the carrier. To take it off the site temporarily, switch it off instead."
                }
                confirmLabel="Remove carrier"
                action={() => deleteCarrier(carrier.id)}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
