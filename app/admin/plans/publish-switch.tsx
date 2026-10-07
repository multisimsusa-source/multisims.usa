"use client"

import * as React from "react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { setPlanPublished } from "./actions"

export function PublishSwitch({ id, name, published }: { id: string; name: string; published: boolean }) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Switch
      checked={published}
      disabled={pending}
      aria-label={published ? `Withdraw ${name}` : `Publish ${name}`}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          const result = await setPlanPublished(id, checked)
          if (result.ok) toast.success(result.message ?? "Saved")
          else toast.error(result.error)
        })
      }
    />
  )
}
