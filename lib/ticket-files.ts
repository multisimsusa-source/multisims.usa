import "server-only"

import { randomUUID } from "node:crypto"

import { createServiceClient } from "@/lib/supabase/service"
import { MEDIA_LIMITS, MAX_TICKET_FILES, mediaKind } from "@/lib/media"

/**
 * Photos and videos on a support ticket. A file goes from the browser straight to private
 * storage on a one-time signed link (start), then the server checks what arrived and records
 * it (finish). Callers check who may add to the ticket first (order link, dealer ownership or
 * staff); these run with the service role.
 */

const BUCKET = "ticket-files"
const URL_SECONDS = 60 * 60

export type TicketFile = {
  id: string
  url: string
  kind: "image" | "video"
  added_by: "customer" | "staff"
  created_at: string
}

export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: string }

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
}

function checkMeta(type: string, size: number): string | null {
  const kind = mediaKind(type)
  if (!kind) return "Use a photo (PNG, JPG, GIF, WebP) or a video (MP4, MOV, WebM)"
  if (!Number.isFinite(size) || size <= 0) return "That file is empty"
  if (size > MEDIA_LIMITS[kind]) return kind === "video" ? "That video is over 50 MB" : "That photo is over 10 MB"
  return null
}

/** A signed upload link for one file on the ticket, after the type, size and count checks. */
export async function startTicketUpload(ticketId: string, file: { type: string; size: number }): Promise<UploadTicket> {
  const problem = checkMeta(file.type, file.size)
  if (problem) return { ok: false, error: problem }
  const db = createServiceClient()
  const { count } = await db.from("ticket_files").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId)
  if ((count ?? 0) >= MAX_TICKET_FILES) return { ok: false, error: `A request takes up to ${MAX_TICKET_FILES} photos and videos` }
  const path = `${ticketId}/${randomUUID()}.${EXT[file.type]}`
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error("[ticket-files] signed upload failed", error)
    return { ok: false, error: "The upload could not start. Try again." }
  }
  return { ok: true, path: data.path, token: data.token }
}

/** Records a file once it is in storage, checking what actually arrived. */
export async function finishTicketUpload(
  ticketId: string,
  path: string,
  who: { addedBy: "customer" | "staff"; uploadedBy: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!path.startsWith(`${ticketId}/`) || path.includes("..")) return { ok: false, error: "Unknown file" }
  const db = createServiceClient()
  const { data: info, error } = await db.storage.from(BUCKET).info(path)
  if (error || !info) return { ok: false, error: "The file did not arrive. Try again." }
  const type = info.contentType ?? ""
  const size = info.size ?? 0
  const problem = checkMeta(type, size)
  const kind = mediaKind(type)
  if (problem || !kind) {
    await db.storage.from(BUCKET).remove([path])
    return { ok: false, error: problem ?? "That file type is not allowed" }
  }
  const { count } = await db.from("ticket_files").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId)
  if ((count ?? 0) >= MAX_TICKET_FILES) {
    await db.storage.from(BUCKET).remove([path])
    return { ok: false, error: `A request takes up to ${MAX_TICKET_FILES} photos and videos` }
  }
  const { error: insertError } = await db.from("ticket_files").insert({
    ticket_id: ticketId,
    path,
    content_type: type,
    size_bytes: size,
    kind,
    added_by: who.addedBy,
    uploaded_by: who.uploadedBy,
  })
  if (insertError) {
    console.error("[ticket-files] insert failed", insertError)
    await db.storage.from(BUCKET).remove([path])
    return { ok: false, error: "The file did not save. Try again." }
  }
  await db.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticketId)
  return { ok: true }
}

/** Each ticket's files with short-lived links, oldest first. */
export async function listTicketFiles(ticketIds: string[]): Promise<Map<string, TicketFile[]>> {
  const out = new Map<string, TicketFile[]>()
  if (!ticketIds.length) return out
  const db = createServiceClient()
  const { data: rows } = await db
    .from("ticket_files")
    .select("id, ticket_id, path, kind, added_by, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at")
  if (!rows?.length) return out
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), URL_SECONDS)
  const urls = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]))
  for (const r of rows) {
    const url = urls.get(r.path)
    if (!url) continue
    const list = out.get(r.ticket_id) ?? []
    list.push({ id: r.id, url, kind: r.kind, added_by: r.added_by, created_at: r.created_at })
    out.set(r.ticket_id, list)
  }
  return out
}
