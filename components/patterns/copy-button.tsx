"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/** Small icon button that copies a value and confirms with a check for 1.5 s. */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {}
      }}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {copied ? <CheckIcon weight="bold" className="size-4 text-success-ink" /> : <CopyIcon className="size-4" />}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  )
}
