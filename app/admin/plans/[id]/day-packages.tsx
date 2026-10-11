"use client"

import * as React from "react"
import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ConfirmAction } from "@/components/admin/confirm-action"
import { centsToInput, type ActionResult } from "@/lib/admin/result"
import type { DayPackage } from "@/lib/types"
import { addDayPackage, deleteDayPackage, setDayPackageActive, updateDayPackage } from "../actions"

// Suggested lengths only. Admin can enter any number of days.
const SUGGESTED_DAYS = [1, 2, 3, 5, 7, 10, 14, 15, 21, 30, 60]

export function DayPackages({ planId, packages }: { planId: string; packages: DayPackage[] }) {
  const used = new Set(packages.map((p) => p.days))

  return (
    <section className="rounded-xl border bg-background" aria-labelledby="packages-title">
      <div className="flex flex-col gap-1 border-b p-4 sm:p-6">
        <h2 id="packages-title" className="font-sans text-base font-semibold tracking-normal">
          Day packages and prices
        </h2>
        <p className="text-sm text-muted-foreground">
          Each length has its own price. Wholesale prices are stored now for the dealer portal.
        </p>
      </div>

      {packages.length ? (
        <div className="divide-y">
          <div aria-hidden className="grid grid-cols-[4.5rem_1fr_1fr] gap-2 px-4 pt-3 pb-2 text-xs text-muted-foreground sm:grid-cols-[6rem_1fr_1fr_auto] sm:gap-3 sm:px-6">
            <span>Days</span>
            <span>Price (USD)</span>
            <span>Wholesale (USD)</span>
            <span className="hidden w-[9.5rem] text-right sm:block">On sale</span>
          </div>
          {packages.map((pkg) => (
            <PackageRow key={`${pkg.id}-${pkg.days}-${pkg.price_cents}-${pkg.wholesale_price_cents}`} pkg={pkg} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
          No packages yet. The plan stays off the website until it has at least one.
        </p>
      )}

      <AddPackage planId={planId} used={used} />
    </section>
  )
}

function useRun() {
  const [pending, startTransition] = React.useTransition()
  const run = (action: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.message) toast.success(result.message)
      onOk?.()
    })
  return { pending, run }
}

function PackageRow({ pkg }: { pkg: DayPackage }) {
  const { pending, run } = useRun()
  const [dirty, setDirty] = React.useState(false)

  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        formData.set("active", pkg.active ? "on" : "off")
        run(() => updateDayPackage(pkg.id, formData), () => setDirty(false))
      }}
      className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2 px-4 py-3 sm:grid-cols-[6rem_1fr_1fr_auto] sm:gap-3 sm:px-6"
    >
      <label>
        <span className="sr-only">Days</span>
        <Input name="days" type="number" min={1} max={365} defaultValue={pkg.days} className="font-mono tabular" />
      </label>
      <label>
        <span className="sr-only">Price in USD</span>
        <Input name="price" inputMode="decimal" defaultValue={centsToInput(pkg.price_cents)} className="font-mono tabular" />
      </label>
      <label>
        <span className="sr-only">Wholesale price in USD</span>
        <Input name="wholesale_price" inputMode="decimal" defaultValue={centsToInput(pkg.wholesale_price_cents)} placeholder="Not set" className="font-mono tabular" />
      </label>
      <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1 sm:w-[9.5rem]">
        <span className={pkg.active ? "mr-auto text-xs text-muted-foreground sm:hidden" : "mr-auto text-xs text-warning-ink sm:hidden"}>
          {pkg.active ? "On sale" : "Not on sale"}
        </span>
        <Switch
          checked={pkg.active}
          disabled={pending}
          aria-label={pkg.active ? `Hide ${pkg.days}-day package` : `Put ${pkg.days}-day package on sale`}
          onCheckedChange={(checked) => run(() => setDayPackageActive(pkg.id, checked))}
          className="mr-1"
        />
        <Button type="submit" variant={dirty ? "default" : "ghost"} disabled={!dirty || pending} className="w-14">
          Save
        </Button>
        <ConfirmAction
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${pkg.days}-day package`}>
              <TrashIcon className="size-4" />
            </Button>
          }
          title={`Remove the ${pkg.days}-day package?`}
          description="Customers will no longer be able to choose this length."
          confirmLabel="Remove package"
          action={() => deleteDayPackage(pkg.id)}
        />
      </div>
    </form>
  )
}

function AddPackage({ planId, used }: { planId: string; used: Set<number> }) {
  const { pending, run } = useRun()
  const formRef = React.useRef<HTMLFormElement>(null)
  const daysRef = React.useRef<HTMLInputElement>(null)
  const priceRef = React.useRef<HTMLInputElement>(null)
  const suggestions = SUGGESTED_DAYS.filter((d) => !used.has(d))

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        run(() => addDayPackage(planId, formData), () => {
          formRef.current?.reset()
          daysRef.current?.focus()
        })
      }}
      className="border-t bg-canvas/60 p-4 sm:rounded-b-xl sm:p-6"
    >
      <p className="text-sm font-medium">Add a package</p>
      {suggestions.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Quick fill days">
          {suggestions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                if (daysRef.current) daysRef.current.value = String(d)
                priceRef.current?.focus()
              }}
              className="h-8 rounded-full border bg-background px-3 font-mono text-xs tabular hover:border-foreground/30"
            >
              {d}d
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[6rem_1fr_1fr_auto]">
        <label className="col-span-2 sm:col-span-1">
          <span className="mb-1 block text-xs text-muted-foreground">Days</span>
          <Input ref={daysRef} name="days" type="number" min={1} max={365} required className="bg-background font-mono tabular" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Price (USD)</span>
          <Input ref={priceRef} name="price" inputMode="decimal" required placeholder="24.00" className="bg-background font-mono tabular" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Wholesale (USD)</span>
          <Input name="wholesale_price" inputMode="decimal" placeholder="Optional" className="bg-background font-mono tabular" />
        </label>
        <div className="col-span-2 flex items-end sm:col-span-1 sm:w-[9.5rem]">
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            <PlusIcon weight="bold" data-icon="inline-start" />
            Add
          </Button>
        </div>
      </div>
    </form>
  )
}
