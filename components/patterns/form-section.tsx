"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Long forms are one bordered surface (FormCard) split into titled sections by
 * hairlines (FormSection), never a stack of separate cards. Fields sit on a 2 or 3
 * column grid from `sm`, one column on phones; full-width fields use `sm:col-span-full`.
 */
export function FormCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("divide-y rounded-xl border bg-card", className)}>{children}</div>
}

export function FormSection({
  title,
  description,
  cols = 2,
  children,
}: {
  title: string
  description?: string
  cols?: 1 | 2 | 3
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <fieldset aria-labelledby={id} className="p-5 sm:p-6">
      <h2 id={id} className="type-card-title">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className={cn("mt-5 grid gap-x-4 gap-y-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>{children}</div>
    </fieldset>
  )
}
