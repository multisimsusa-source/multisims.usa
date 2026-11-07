import "server-only"

import { randomUUID } from "node:crypto"

import { createServiceClient } from "@/lib/supabase/service"
import { checkImage } from "@/lib/uploads"

/**
 * Photos of a buyer's IMEI, EID or SIM card, for the agent who activates the line. Callers
 * check who may add to the order first (order link, or dealer ownership); these run with
 * the service role.
 */

export const MAX_ORDER_PHOTOS = 10
const URL_SECONDS = 60 * 30

export type OrderPhoto = { id: string; url: string; created_at: string }

export async function addOrderPhoto(orderId: string, file: File, uploadedBy: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const checked = await checkImage(file)
  if ("error" in checked) return { ok: false, error: checked.error }
  const db = createServiceClient()
  const { count } = await db.from("order_photos").select("id", { count: "exact", head: true }).eq("order_id", orderId)
  if ((count ?? 0) >= MAX_ORDER_PHOTOS) return { ok: false, error: `An order takes up to ${MAX_ORDER_PHOTOS} photos` }
  const path = `${orderId}/${randomUUID()}.${checked.ext}`
  const { error: uploadError } = await db.storage.from("device-photos").upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error("[photos] upload failed", uploadError)
    return { ok: false, error: "The photo did not upload. Try a smaller image." }
  }
  const { error } = await db.from("order_photos").insert({ order_id: orderId, path, uploaded_by: uploadedBy })
  if (error) {
    await db.storage.from("device-photos").remove([path])
    return { ok: false, error: "The photo did not save. Try again." }
  }
  return { ok: true }
}

/** The order's photos with short-lived links, oldest first. */
export async function listOrderPhotos(orderIds: string[]): Promise<Map<string, OrderPhoto[]>> {
  const out = new Map<string, OrderPhoto[]>()
  if (!orderIds.length) return out
  const db = createServiceClient()
  const { data: rows } = await db.from("order_photos").select("id, order_id, path, created_at").in("order_id", orderIds).order("created_at")
  if (!rows?.length) return out
  const { data: signed } = await db.storage.from("device-photos").createSignedUrls(rows.map((r) => r.path), URL_SECONDS)
  const urls = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]))
  for (const r of rows) {
    const url = urls.get(r.path)
    if (!url) continue
    const list = out.get(r.order_id) ?? []
    list.push({ id: r.id, url, created_at: r.created_at })
    out.set(r.order_id, list)
  }
  return out
}
