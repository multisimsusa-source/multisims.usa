/**
 * Numbers a dealer pastes, one per row: a US phone number and, if known, its SIM's ICCID.
 * Shared by the refill and the services pages.
 */

export type Parsed = { phone: string; iccid: string }

export type Problem = "not_us" | "bad_iccid" | "repeat"
export type ParsedLine = { numbers: Parsed[]; problems: { row: number; problem: Problem }[] }

const ICCID = /^\d{18,22}[Ff]?$/

/** The number as the database keys it: its 10 digits, without a leading 1. */
export const keyOf = (phone: string) => phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")

export function isUsNumber(part: string) {
  const digits = part.replace(/\D/g, "")
  return !/[^\d\s()+.-]/.test(part) && (digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))
}

/**
 * One pasted row: a US phone number and, if known, the SIM's ICCID, separated by a comma,
 * tab or space, in either order; or several numbers separated by commas or tabs.
 */
export function parseRow(row: string): Parsed[] | Problem {
  const parts = row.split(/[,;\t]+|\s{2,}/).map((p) => p.trim()).filter(Boolean)
  const pieces = parts.length > 1 ? parts : row.trim().split(/\s+(?=\d{18,22}[Ff]?$)/)
  const phones: string[] = []
  const iccids: string[] = []
  for (const part of pieces) {
    const digits = part.replace(/[\s()+.-]/g, "")
    if (ICCID.test(digits)) iccids.push(digits)
    else if (isUsNumber(part)) phones.push(part)
    // A long run of digits that is no US number is an ICCID typed wrong.
    else if (/^\d{12,}$/.test(digits) || /^[02-9]\d{10}$/.test(digits)) return "bad_iccid"
    else return "not_us"
  }
  if (!phones.length || iccids.length > 1 || (iccids.length && phones.length > 1)) return "not_us"
  return phones.map((phone) => ({ phone, iccid: iccids[0] ?? "" }))
}

/** Every line's numbers, with each problem row named; a number already seen on any line is a repeat. */
export function parseLines(texts: string[]): ParsedLine[] {
  const seen = new Set<string>()
  return texts.map((text) => {
    const out: ParsedLine = { numbers: [], problems: [] }
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .forEach((row, i) => {
        if (!row) return
        const parsed = parseRow(row)
        if (typeof parsed === "string") return void out.problems.push({ row: i + 1, problem: parsed })
        for (const n of parsed) {
          const key = keyOf(n.phone)
          if (seen.has(key)) return void out.problems.push({ row: i + 1, problem: "repeat" })
          seen.add(key)
          out.numbers.push(n)
        }
      })
    return out
  })
}

const rowList = (rows: number[]) => {
  const shown = rows.slice(0, 5)
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : `${shown[0]}`
  return `${rows.length > 1 ? "Rows" : "Row"} ${list}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}`
}

/** One sentence per kind of problem: "Rows 2 and 4 are not US numbers." */
export function problemText(problems: ParsedLine["problems"], noun = "refill") {
  const of = (p: Problem) => problems.filter((x) => x.problem === p).map((x) => x.row)
  const many = (rows: number[]) => rows.length > 1
  const out: string[] = []
  const notUs = of("not_us")
  if (notUs.length) out.push(`${rowList(notUs)} ${many(notUs) ? "are not US numbers" : "is not a US number"}. Put one number per row, then its ICCID if you have it.`)
  const iccid = of("bad_iccid")
  if (iccid.length) out.push(`${rowList(iccid)} ${many(iccid) ? "have an ICCID" : "has an ICCID"} that is not 18 to 22 digits.`)
  const repeat = of("repeat")
  if (repeat.length) out.push(`${rowList(repeat)} ${many(repeat) ? "repeat numbers" : "repeats a number"} already in this ${noun}.`)
  return out.join(" ")
}
