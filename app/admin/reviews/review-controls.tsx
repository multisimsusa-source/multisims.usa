"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { setReviewFeatured, setReviewHidden } from "./actions"

export function FeatureSwitch({ id, featured, name }: { id: string; featured: boolean; name: string }) {
  const [on, setOn] = React.useState(featured)
  const [pending, start] = React.useTransition()
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <span className="text-muted-foreground">Featured</span>
      <Switch
        checked={on}
        disabled={pending}
        aria-label={`Feature ${name}'s review on the website`}
        onCheckedChange={(next) => {
          setOn(next)
          start(async () => {
            const result = await setReviewFeatured(id, next)
            if (!result.ok) {
              setOn(!next)
              toast.error(result.error)
            } else toast.success(result.message ?? "Saved")
          })
        }}
      />
    </label>
  )
}

export function HideButton({ id, hidden }: { id: string; hidden: boolean }) {
  const [pending, start] = React.useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await setReviewHidden(id, !hidden)
          if (result.ok) toast.success(result.message ?? "Saved")
          else toast.error(result.error)
        })
      }
    >
      {hidden ? "Unhide" : "Hide"}
    </Button>
  )
}
