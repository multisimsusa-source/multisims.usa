import Image from "next/image"

import { bundledCarrierLogo } from "@/lib/carrier-logos"
import { publicStorageUrl } from "@/lib/supabase/env"
import type { Carrier } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  carrier: Pick<Carrier, "name" | "logo_path">
  className?: string
  size?: "sm" | "md"
  /** "mono" flattens the logo to one ink colour, for rows of logos side by side. */
  tone?: "color" | "mono"
}

const BASE_HEIGHT = { sm: 18, md: 30 }

/**
 * Uploaded carrier logo, else a built-in logo for known carriers, else the name set
 * in type. Wide wordmarks are drawn shorter and compact marks taller, so a row of
 * logos reads at one visual weight.
 */
export function CarrierLogo({ carrier, className, size = "md", tone = "color" }: Props) {
  const bundled = carrier.logo_path ? null : bundledCarrierLogo(carrier.name)
  const src = carrier.logo_path ? publicStorageUrl("carrier-logos", carrier.logo_path) : bundled?.file

  if (!src) {
    return (
      <span
        className={cn(
          "font-heading font-semibold tracking-[-0.03em] whitespace-nowrap text-foreground/80",
          size === "sm" ? "text-sm" : "text-xl",
          className
        )}
      >
        {carrier.name}
      </span>
    )
  }

  const aspect = bundled?.aspect ?? 3
  const height = Math.round(BASE_HEIGHT[size] * Math.min(1.2, Math.max(0.75, Math.sqrt(3 / aspect))))

  return (
    <Image
      src={src}
      alt={carrier.name}
      width={Math.round(height * aspect)}
      height={height}
      unoptimized={Boolean(bundled)}
      className={cn(
        "w-auto object-contain",
        tone === "mono"
          ? "opacity-55 brightness-0 dark:opacity-75 dark:invert"
          : "dark:brightness-0 dark:invert",
        className
      )}
      style={{ height }}
    />
  )
}
