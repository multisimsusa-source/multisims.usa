"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Light / dark switch. Starts from the system setting; a click pins the opposite theme. */
export function ThemeToggle({ className, tooltip = false }: { className?: string; tooltip?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  // The resolved theme is only known in the browser; render a neutral button on the server.
  const mounted = React.useSyncExternalStore(subscribeNoop, () => true, () => false)
  const dark = mounted && resolvedTheme === "dark"
  const label = dark ? "Switch to light theme" : "Switch to dark theme"

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={label}
      title={tooltip ? undefined : label}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("relative text-muted-foreground hover:text-foreground", className)}
    >
      <SunIcon
        weight="bold"
        aria-hidden
        className={cn(
          "absolute size-[18px] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"
        )}
      />
      <MoonIcon
        weight="bold"
        aria-hidden
        className={cn(
          "absolute size-[18px] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        )}
      />
    </Button>
  )

  if (!tooltip) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom" sideOffset={6}>
        {dark ? "Light theme" : "Dark theme"}
      </TooltipContent>
    </Tooltip>
  )
}

function subscribeNoop() {
  return () => {}
}
