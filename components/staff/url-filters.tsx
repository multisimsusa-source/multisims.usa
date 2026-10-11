"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const ALL = "all"

export type FilterSelect = {
  param: string
  label: string
  value: string
  items: { value: string; label: string }[]
  className?: string
}

/**
 * Search box plus selects that write to the URL, so filters survive reloads and can be
 * shared. Changing any filter resets to page 1.
 */
export function UrlFilters({
  query,
  placeholder,
  selects = [],
  params,
}: {
  query: string
  placeholder: string
  selects?: FilterSelect[]
  /** Current params, so unrelated ones are kept. */
  params: Record<string, string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()
  const [text, setText] = React.useState(query)

  const apply = React.useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams()
      for (const [k, v] of Object.entries({ ...params, ...changes })) {
        if (k === "page" || !v || v === ALL) continue
        next.set(k, v.trim())
      }
      const qs = next.toString()
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
    },
    [params, pathname, router]
  )

  React.useEffect(() => {
    if (text.trim() === query) return
    const id = window.setTimeout(() => apply({ q: text }), 300)
    return () => window.clearTimeout(id)
  }, [text, query, apply])

  return (
    <div
      className={cn("mb-4 grid gap-2", selects.length === 1 && "sm:grid-cols-[1fr_auto]", selects.length >= 2 && "sm:grid-cols-2 lg:grid-cols-[1fr_repeat(var(--n),auto)]")}
      style={{ "--n": selects.length } as React.CSSProperties}
      aria-busy={pending}
    >
      <div className="relative sm:max-lg:col-span-2">
        <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="bg-background pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            onClick={() => setText("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon weight="bold" className="size-3.5" />
          </button>
        ) : null}
      </div>
      {selects.map((s) => (
        <Select key={s.param} items={s.items} value={s.value || ALL} onValueChange={(v) => apply({ [s.param]: String(v ?? ALL) })}>
          <SelectTrigger aria-label={s.label} className={cn("w-full bg-background lg:w-44", s.className)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {s.items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  )
}

export { ALL as FILTER_ALL }
