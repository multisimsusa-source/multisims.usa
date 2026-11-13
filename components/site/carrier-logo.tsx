import Image from "next/image"

import { bundledCarrierLogo } from "@/lib/carrier-logos"
import { publicStorageUrl } from "@/lib/supabase/env"
import type { Carrier } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  carrier: Pick<Carrier, "name" | "logo_path">
  className?: string
  size?: "sm" | "md"
  /** "mono" quiets the logo for rows of logos side by side (one ink for built-in logos, grey for uploads). */
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

  const image = (
    <Image
      src={src}
      alt={carrier.name}
      width={Math.round(height * aspect)}
      height={height}
      unoptimized={Boolean(bundled)}
      className={cn(
        "w-auto object-contain",
        bundled
          ? // Built-in logos are transparent dark-ink SVGs: one ink, white in dark mode.
            tone === "mono"
            ? "opacity-55 brightness-0 group-hover:opacity-100 group-hover:brightness-100 group-focus-visible:opacity-100 group-focus-visible:brightness-100 dark:opacity-75 dark:invert dark:group-hover:brightness-0 dark:group-focus-visible:brightness-0"
            : "dark:brightness-0 dark:invert"
          : // Uploads keep their own colours (any background); the strip only greys them.
            tone === "mono" &&
              "opacity-70 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0",
        className
      )}
      style={{ height }}
    />
  )
  if (bundled) return image
  // An uploaded logo may have dark ink or its own white background: in dark mode it sits on
  // a small light plate, so it reads either way.
  return <span className="inline-flex shrink-0 items-center rounded-sm dark:bg-white dark:px-1.5 dark:py-0.5">{image}</span>
}
