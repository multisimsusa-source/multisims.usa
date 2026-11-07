import type { ProductType } from "@/lib/types"

/**
 * The buyer's device details an agent needs to activate a line (Zafir, 7 Nov). All optional.
 *
 *   Monthly plan: eSIM IMEI + EID, SIM card EID + ICCID
 *   Daily plan:   eSIM IMEI + EID, SIM card IMEI + ICCID
 *
 * Shared by the server and the browser, so every form asks for the same things.
 */

export type PlanType = "daily" | "monthly"
export type DeviceField = "imei" | "eid" | "buyer_iccid"
export type DeviceValues = Partial<Record<DeviceField, string>>

export const planTypeLabel: Record<PlanType, string> = { daily: "Daily plan", monthly: "Monthly plan" }

/** The fields a plan asks for, in the order a dealer pastes them. */
export function deviceFields(planType: PlanType | null | undefined, productType: ProductType): DeviceField[] {
  if (productType === "esim") return ["imei", "eid"]
  return planType === "monthly" ? ["eid", "buyer_iccid"] : ["imei", "buyer_iccid"]
}

/**
 * The phone details asked at checkout and on the order page: the plan's fields, without the
 * SIM card's own ICCID (we post the card, so a website buyer does not have it yet).
 */
export function checkoutDeviceFields(planType: PlanType | null | undefined, productType: ProductType): DeviceField[] {
  return deviceFields(planType, productType).filter((f) => f !== "buyer_iccid")
}

export const deviceLabel: Record<DeviceField, string> = { imei: "IMEI", eid: "EID", buyer_iccid: "SIM number (ICCID)" }
export const deviceShortLabel: Record<DeviceField, string> = { imei: "IMEI", eid: "EID", buyer_iccid: "ICCID" }

const PATTERN: Record<DeviceField, RegExp> = {
  imei: /^\d{15}$/,
  eid: /^\d{32}$/,
  buyer_iccid: /^\d{18,22}[Ff]?$/,
}

export const deviceError: Record<DeviceField, string> = {
  imei: "An IMEI is 15 digits",
  eid: "An EID is 32 digits",
  buyer_iccid: "An ICCID is 18 to 22 digits",
}

export const deviceHelp: Record<DeviceField, string> = {
  imei: "15 digits. Dial *#06# on the phone to see it.",
  eid: "32 digits. Dial *#06# on the phone to see it.",
  buyer_iccid: "18 to 22 digits, printed on the SIM card.",
}

/** Spaces and dashes people copy along with the number are dropped. */
export function tidyDevice(value: string) {
  return value.replace(/[\s-]/g, "")
}

/** An error message for a filled value in the wrong format, or null. Empty is fine. */
export function checkDevice(field: DeviceField, value: string): string | null {
  const v = tidyDevice(value)
  return v === "" || PATTERN[field].test(v) ? null : deviceError[field]
}

/** Which field a pasted number is, from its length. */
function fieldOf(value: string, fields: DeviceField[]): DeviceField | null {
  for (const f of fields) if (PATTERN[f].test(value)) return f
  return null
}

export type DeviceRowProblem = { row: number; text: string }

/**
 * A dealer's paste: one SIM per row, its numbers separated by commas, tabs or spaces, in any
 * order (each is told apart by its length). Blank rows are skipped.
 */
export function parseDeviceRows(text: string, fields: DeviceField[]): { rows: DeviceValues[]; problems: DeviceRowProblem[] } {
  const rows: DeviceValues[] = []
  const problems: DeviceRowProblem[] = []
  const lines = text.split(/\r?\n/)
  let row = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    row += 1
    const parts = line.split(/[\s,;]+/).map((p) => p.replace(/-/g, "")).filter(Boolean)
    const values: DeviceValues = {}
    let bad = false
    for (const part of parts) {
      const field = fieldOf(part, fields)
      if (!field || values[field]) {
        bad = true
        break
      }
      values[field] = part
    }
    if (bad || !parts.length) {
      problems.push({ row, text: `Row ${row} is not ${fields.map((f) => deviceShortLabel[f]).join(" and ")}. ${fields.map((f) => deviceError[f]).join("; ")}.` })
      continue
    }
    rows.push(values)
  }
  return { rows, problems }
}
