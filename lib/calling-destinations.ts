/**
 * The international calling destinations list: where the add-on reaches and how many
 * minutes each destination allows (null = unlimited).
 */
export type Destination = { name: string; minutes_cap: number | null }

/**
 * Reads the carrier's rate table, either as text taken from its PDF (pdftotext -layout)
 * or as CSV ("Destination,Minutes" with "Unlimited" or a number). Handles names that wrap
 * onto a second line and values pushed past a page footer.
 */
export function parseDestinations(text: string): Destination[] {
  const out = new Map<string, Destination>()
  let pending = ""
  const add = (name: string, value: string) => {
    const clean = name.replace(/\s+/g, " ").replace(/\s*-\s*$/, "").trim()
    if (!clean || /^destination$/i.test(clean)) return
    out.set(clean.toLowerCase(), { name: clean, minutes_cap: /^unlimited$/i.test(value) ? null : Number(value) })
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/"/g, "").trimEnd()
    const trimmed = line.trim()
    if (!trimmed) continue
    // Page furniture of the carrier's PDF.
    if (/^(MVNOC|Confidential|Page\s*-|ILD RATE TABLE|Destination\s+Max|T-Mobile MVNO|Rate Terms|Initials|Client\s+Provider|\d\.\s)/i.test(trimmed)) continue

    const csv = trimmed.match(/^(.+?)\s*[,;\t]\s*(Unlimited|\d+)$/i)
    const layout = line.match(/^\s*(.+?)\s{2,}(Unlimited|\d+)\s*$/i)
    const valueOnly = trimmed.match(/^(Unlimited|\d+)$/i)
    const hit = csv ?? layout

    if (valueOnly && pending) {
      add(pending, valueOnly[1])
      pending = ""
    } else if (hit) {
      const name = pending.endsWith("-") ? `${pending} ${hit[1]}` : hit[1]
      add(name, hit[2])
      pending = ""
    } else {
      pending = pending.endsWith("-") ? `${pending} ${trimmed}` : trimmed
    }
  }
  return [...out.values()]
}

export function minutesLabel(cap: number | null) {
  return cap === null ? "Unlimited" : `Up to ${cap} min`
}
