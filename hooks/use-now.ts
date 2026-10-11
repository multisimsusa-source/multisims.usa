import * as React from "react"

/**
 * The current time, re-rendering every `stepMs`. Null during server render and
 * hydration, so time-dependent text never causes a hydration mismatch.
 */
export function useNow(stepMs = 10_000): number | null {
  return React.useSyncExternalStore(
    (onChange) => {
      const id = window.setInterval(onChange, stepMs)
      return () => window.clearInterval(id)
    },
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => null
  )
}
