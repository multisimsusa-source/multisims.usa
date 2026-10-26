/**
 * Plan dates are US calendar days (where lines run), stored as YYYY-MM-DD and inclusive at
 * both ends: a 30-day plan starting 1 Nov ends 30 Nov.
 */

/** Today in the US (Eastern), as YYYY-MM-DD. */
export function usToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}

/** "12 Nov 2026". */
export function formatPlanDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`)
  )
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Digits only, a US number without its leading 1: the same key the database uses. */
export function phoneKey(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "")
  if (!d) return null
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d
}

export type PlanWindow = { starts_on: string; ends_on: string }

/**
 * Where a number stands today, from every plan window it has had (first plan, refills):
 * the one running now, the next one already bought, or else the last one that ended.
 */
export type LineTimer = { current: PlanWindow | null; next: PlanWindow | null; ended: PlanWindow | null }

export function lineTimer(windows: PlanWindow[], today = usToday()): LineTimer {
  const sorted = [...windows].sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.ends_on.localeCompare(b.ends_on))
  const current = sorted.filter((w) => w.starts_on <= today && w.ends_on >= today).at(-1) ?? null
  const next = sorted.find((w) => w.starts_on > today) ?? null
  const ended = current || next ? null : (sorted.filter((w) => w.ends_on < today).at(-1) ?? null)
  return { current, next, ended }
}
