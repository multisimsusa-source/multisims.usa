"use client"

import Link from "next/link"
import { ArrowSquareOutIcon, CopyIcon, DotsThreeIcon } from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export type RowAction =
  | { label: string; href: string; icon?: Icon; external?: boolean }
  | { label: string; copy: string; icon?: Icon }
  | "separator"

/**
 * The secondary actions of one table or list row, behind a "more" button at the row's end.
 * The row itself stays one click target (its stretched link opens the record); this sits
 * above that link layer. Copy actions confirm with a toast.
 */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  return (
    <div className="relative z-10 flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={label} className="text-muted-foreground hover:text-foreground">
              <DotsThreeIcon weight="bold" className="size-5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-52">
          {actions.map((a, i) => {
            if (a === "separator") return <DropdownMenuSeparator key={`sep-${i}`} />
            if ("copy" in a) {
              const Glyph = a.icon ?? CopyIcon
              return (
                <DropdownMenuItem
                  key={a.label}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(a.copy)
                      toast.success(`Copied ${a.copy}`)
                    } catch {
                      toast.error("Could not copy. Select the text instead.")
                    }
                  }}
                >
                  <Glyph />
                  {a.label}
                </DropdownMenuItem>
              )
            }
            const Glyph = a.icon ?? (a.external ? ArrowSquareOutIcon : undefined)
            return (
              <DropdownMenuItem
                key={a.label}
                render={a.external ? <a href={a.href} target="_blank" rel="noopener noreferrer" /> : <Link href={a.href} />}
              >
                {Glyph ? <Glyph /> : null}
                {a.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
