import type { SupabaseClient } from "@supabase/supabase-js"

/** Dealer accounts and their wallet. Shared by the admin Dealers pages and the dealer portal. */

export type Dealer = {
  profile_id: string
  company: string
  phone: string
  credit_limit_cents: number
  sim_card_price_cents: number | null
  note: string
  created_at: string
}

export type DealerWithLogin = Dealer & { profile: { full_name: string; email: string; active: boolean } }

export type Wallet = {
  balance_cents: number
  reserved_cents: number
  credit_limit_cents: number
  available_cents: number
}

export type LedgerKind =
  | "topup"
  | "manual_add"
  | "adjustment_credit"
  | "adjustment_debit"
  | "reserve"
  | "capture"
  | "release"
  | "refund"

export type LedgerEntry = {
  id: number
  dealer_id: string
  kind: LedgerKind
  amount_cents: number
  order_id: string | null
  order_item_id: string | null
  batch_id: string | null
  payment_id: string | null
  created_by: string | null
  note: string | null
  created_at: string
}

/** What each movement is called on screen, and which way it moves the dealer's money. */
export const ledgerKind: Record<LedgerKind, { label: string; effect: "in" | "out" | "hold" | "unhold" }> = {
  topup: { label: "Crypto top-up", effect: "in" },
  manual_add: { label: "Funds added", effect: "in" },
  adjustment_credit: { label: "Correction, added", effect: "in" },
  adjustment_debit: { label: "Correction, taken", effect: "out" },
  reserve: { label: "Held for order", effect: "hold" },
  capture: { label: "SIM delivered", effect: "out" },
  release: { label: "Hold returned", effect: "unhold" },
  refund: { label: "Refund", effect: "in" },
}

/** Owner entries from the admin wallet panel. */
export const ownerEntryKinds = ["manual_add", "adjustment_credit", "adjustment_debit"] as const
export type OwnerEntryKind = (typeof ownerEntryKinds)[number]

export const emptyWallet: Wallet = { balance_cents: 0, reserved_cents: 0, credit_limit_cents: 0, available_cents: 0 }

/** The wallet as the caller may see it (own wallet for a dealer, any for the owner). */
export async function getWallet(db: SupabaseClient, dealerId: string): Promise<Wallet> {
  const { data } = await db.rpc("dealer_wallet", { p_dealer_id: dealerId })
  const row = (data as Wallet[] | null)?.[0]
  if (!row) return emptyWallet
  return {
    balance_cents: Number(row.balance_cents),
    reserved_cents: Number(row.reserved_cents),
    credit_limit_cents: Number(row.credit_limit_cents),
    available_cents: Number(row.available_cents),
  }
}

export async function listLedger(db: SupabaseClient, dealerId: string, limit = 200): Promise<LedgerEntry[]> {
  const { data } = await db
    .from("wallet_ledger")
    .select("*")
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)
  return (data ?? []) as LedgerEntry[]
}

export function batchLabel(number: number) {
  return `B-${number}`
}
