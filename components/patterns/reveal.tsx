"use client"

import * as React from "react"

/**
 * Scroll reveal for the public site (never the portals). Content settles in as it
 * scrolls into view: a short rise, fade and un-blur (styles in app/globals.css).
 *
 * Safe by default: the server renders content visible, and only blocks that start below
 * the fold are hidden after hydration, so nothing on screen flickers and a failed script
 * leaves the page fully readable. Lists pass `index` for a short stagger (capped).
 */

type RevealProps<T extends React.ElementType> = {
  as?: T
  /** Position in a list, for the stagger. Capped at 6 so long lists never wait. */
  index?: number
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">

const MAX_STAGGER = 6

let observer: IntersectionObserver | null = null

function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        ;(entry.target as HTMLElement).dataset.reveal = "shown"
        observer?.unobserve(entry.target)
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  )
  return observer
}

export function Reveal<T extends React.ElementType = "div">({
  as,
  index = 0,
  className,
  children,
  style,
  ...rest
}: RevealProps<T>) {
  const ref = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const el = ref.current
    const io = getObserver()
    if (!el || !io) return
    // Already on screen (or above it): leave it alone, it was seen as rendered.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return
    el.dataset.reveal = "hidden"
    io.observe(el)
    return () => io.unobserve(el)
  }, [])

  const Tag = (as ?? "div") as React.ElementType
  return (
    <Tag
      ref={ref}
      data-reveal=""
      className={className}
      style={
        {
          ...(style as React.CSSProperties),
          "--reveal-i": Math.min(index, MAX_STAGGER),
        } as React.CSSProperties
      }
      {...rest}
    >
      {children}
    </Tag>
  )
}
