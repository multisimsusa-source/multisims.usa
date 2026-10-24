"use server"

import { after } from "next/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { createLogin, deleteLogin, parseLogin, resetLoginPassword, setLoginActive } from "@/lib/admin/logins"
import { parseMoney, zodFieldErrors, type ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { ownerEntryKinds, type OwnerEntryKind } from "@/lib/dealers"
import { sendEmail } from "@/lib/email"
import { dealerWelcomeEmail } from "@/lib/emails"
import { formatPrice } from "@/lib/format"
import { notifyDealerFunds } from "@/lib/notify"
import { absoluteUrl } from "@/lib/site"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

const company = z.string().trim().min(2, "Enter the company name").max(120)
const phone = z.string().trim().max(40, "Too long")

export async function createDealer(formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  const login = parseLogin(formData)
  const details = z.object({ company, phone }).safeParse({ company: formData.get("company"), phone: formData.get("phone") ?? "" })
  if (!login.ok || !details.success) {
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: { ...(login.ok ? {} : login.fieldErrors), ...(details.success ? {} : zodFieldErrors(details.error.issues)) },
    }
  }

  const created = await createLogin("dealer", login.data)
  if (!created.ok || !created.userId) return created

  const db = createServiceClient()
  const { error } = await db.from("dealers").insert({ profile_id: created.userId, company: details.data.company, phone: details.data.phone })
  if (error) {
    await deleteLogin(created.userId)
    return { ok: false, error: "Could not create the dealer. Try again." }
  }

  const mail = dealerWelcomeEmail(login.data.full_name, details.data.company, absoluteUrl("/portal/login"))
  after(() => sendEmail({ sender: "orders", to: login.data.email, ...mail }))
  refresh()
  return { ok: true, id: created.userId, message: `${details.data.company} can sign in now. Share the password with them yourself.` }
}

export async function setDealerActive(dealerId: string, active: boolean): Promise<ActionResult> {
  await requireRole("admin")
  const result = await setLoginActive("dealer", dealerId, active)
  if (!result.ok) return result
  refresh()
  return {
    ok: true,
    message: active ? "Dealer switched on" : "Dealer suspended. They cannot sign in or order; orders already placed are still filled.",
  }
}

export async function resetDealerPassword(dealerId: string, newPassword: string): Promise<ActionResult> {
  await requireRole("admin")
  return resetLoginPassword("dealer", dealerId, newPassword)
}

const accountSchema = z.object({
  company,
  phone,
  note: z.string().trim().max(1000, "Keep it under 1000 characters"),
})

export async function saveDealerAccount(dealerId: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(dealerId).success) return { ok: false, error: "Unknown dealer" }
  const parsed = accountSchema.safeParse({
    company: formData.get("company"),
    phone: formData.get("phone") ?? "",
    note: formData.get("note") ?? "",
  })
  const creditLimit = parseMoney(formData.get("credit_limit"))
  const simPrice = parseMoney(formData.get("sim_card_price"))
  const fieldErrors: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error.issues)
  if (creditLimit === null || Number.isNaN(creditLimit)) fieldErrors.credit_limit = "Enter an amount, 0 for none"
  if (Number.isNaN(simPrice)) fieldErrors.sim_card_price = "Enter a price like 4.00, or leave it empty"
  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted fields", fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase
    .from("dealers")
    .update({ ...parsed.data, credit_limit_cents: creditLimit, sim_card_price_cents: simPrice })
    .eq("profile_id", dealerId)
  if (error) return { ok: false, error: "Could not save. Try again." }
  refresh()
  return { ok: true, message: "Saved" }
}

const entryLabels: Record<OwnerEntryKind, string> = {
  manual_add: "Funds added",
  adjustment_credit: "Correction added",
  adjustment_debit: "Correction taken",
}

export async function addWalletEntry(dealerId: string, kind: OwnerEntryKind, amount: string, note: string): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(dealerId).success) return { ok: false, error: "Unknown dealer" }
  if (!ownerEntryKinds.includes(kind)) return { ok: false, error: "Choose what this is" }
  const cents = parseMoney(amount)
  if (cents === null || Number.isNaN(cents) || cents <= 0) return { ok: false, error: "Enter an amount above zero, like 700.00", fieldErrors: { amount: "Enter an amount above zero" } }
  if (note.trim().length < 3) return { ok: false, error: "Add a note so the dealer knows what it is", fieldErrors: { note: "Add a short note" } }

  const supabase = await createClient()
  const { data: entry, error } = await supabase.rpc("wallet_owner_entry", {
    p_dealer_id: dealerId,
    p_kind: kind,
    p_amount_cents: cents,
    p_note: note,
  })
  if (error) {
    const available = /only (-?\d+) is available/.exec(error.message)?.[1]
    if (available) return { ok: false, error: `Only ${formatPrice(Number(available))} is available to take` }
    return { ok: false, error: "Could not save the entry. Try again." }
  }
  if (kind !== "adjustment_debit") {
    const id = (entry as { id: number } | null)?.id
    after(() => notifyDealerFunds(dealerId, cents, "owner", note.trim(), `funds-${id}`))
  }
  refresh()
  return { ok: true, message: `${entryLabels[kind]}: ${formatPrice(cents)}` }
}

/**
 * Per-dealer prices. Each field is one day package: a price overrides the wholesale price,
 * an empty field goes back to it.
 */
export async function saveDealerPrices(dealerId: string, formData: FormData): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(dealerId).success) return { ok: false, error: "Unknown dealer" }

  const set: { dealer_id: string; day_package_id: string; price_cents: number }[] = []
  const clear: string[] = []
  const fieldErrors: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price:")) continue
    const packageId = key.slice(6)
    if (!z.uuid().safeParse(packageId).success) continue
    const cents = parseMoney(value)
    if (cents === null) clear.push(packageId)
    else if (Number.isNaN(cents)) fieldErrors[key] = "Enter a price like 6.50"
    else set.push({ dealer_id: dealerId, day_package_id: packageId, price_cents: cents })
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted prices", fieldErrors }

  const supabase = await createClient()
  if (set.length) {
    const { error } = await supabase.from("dealer_prices").upsert(set, { onConflict: "dealer_id,day_package_id" })
    if (error) return { ok: false, error: "Could not save the prices. Try again." }
  }
  if (clear.length) {
    const { error } = await supabase.from("dealer_prices").delete().eq("dealer_id", dealerId).in("day_package_id", clear)
    if (error) return { ok: false, error: "Could not save the prices. Try again." }
  }
  refresh()
  return { ok: true, message: set.length ? `Saved ${set.length} special ${set.length === 1 ? "price" : "prices"}` : "All prices follow the wholesale price list" }
}
