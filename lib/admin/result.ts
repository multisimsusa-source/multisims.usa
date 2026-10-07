export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form")
    out[key] ??= issue.message
  }
  return out
}

/** Parses "12", "12.5" or "$12.50" into cents. Returns null when invalid. */
export function parseMoney(value: FormDataEntryValue | null): number | null {
  if (value === null) return null
  const cleaned = String(value).replace(/[$,\s]/g, "")
  if (cleaned === "") return null
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN
  return Math.round(Number(cleaned) * 100)
}

export function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return ""
  return (cents / 100).toFixed(2)
}

export function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505"
}
