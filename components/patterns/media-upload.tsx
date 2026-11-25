"use client"

import * as React from "react"
import { FilmStripIcon, PaperclipIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { ActionResult } from "@/lib/admin/result"
import { MEDIA_LIMITS, MEDIA_TYPES, mediaKind } from "@/lib/media"
import { createClient } from "@/lib/supabase/browser"

export type MediaFile = {
  id: string
  url: string
  kind: "image" | "video"
  added_by: "customer" | "staff"
}

export type StartUpload = (file: { type: string; size: number }) => Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }>

const ACCEPT = [...MEDIA_TYPES.image, ...MEDIA_TYPES.video].join(",")

/**
 * Photos and videos on a support request, from both sides: square tiles (a photo opens full
 * size, a video plays in place) with who added each, and one Add photo or video button. The
 * file goes straight to private storage on a signed link, so a 50 MB phone video works.
 */
export function MediaUpload({
  files,
  max,
  canAdd,
  start,
  finish,
  bucket = "ticket-files",
  byLabel,
  emptyText = "No photos or videos yet.",
}: {
  files: MediaFile[]
  max: number
  canAdd: boolean
  start?: StartUpload
  finish?: (path: string) => Promise<ActionResult>
  bucket?: string
  /** How each side is named to the person looking, for example "You" and "Support". */
  byLabel: { customer: string; staff: string }
  emptyText?: string
}) {
  const inputId = React.useId()
  const [pending, setPending] = React.useState(false)
  const full = files.length >= max

  const pick = async (file: File | undefined) => {
    if (!file || !start || !finish) return
    const kind = mediaKind(file.type)
    if (!kind) return void toast.error("Use a photo (PNG, JPG, GIF, WebP) or a video (MP4, MOV, WebM)")
    if (file.size > MEDIA_LIMITS[kind]) return void toast.error(kind === "video" ? "That video is over 50 MB" : "That photo is over 10 MB")
    setPending(true)
    try {
      const ticket = await start({ type: file.type, size: file.size })
      if (!ticket.ok) return void toast.error(ticket.error)
      const { error } = await createClient().storage.from(bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type })
      if (error) return void toast.error("The upload did not finish. Check your connection and try again.")
      const result = await finish(ticket.path)
      if (!result.ok) return void toast.error(result.error)
      toast.success(result.message ?? (kind === "video" ? "Video added" : "Photo added"))
    } catch {
      toast.error("The upload did not finish. Check your connection and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <li key={f.id} className="flex min-w-0 flex-col gap-1">
              {f.kind === "video" ? (
                <video
                  src={f.url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Video ${i + 1} from ${byLabel[f.added_by]}`}
                  className="aspect-square w-full rounded-lg border bg-muted object-cover"
                />
              ) : (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Photo ${i + 1} from ${byLabel[f.added_by]}, opens full size`}
                  className="block overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {/* Signed, short-lived URL: next/image would cache it under a public key. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="aspect-square w-full object-cover" />
                </a>
              )}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {f.kind === "video" ? <FilmStripIcon className="size-3" aria-hidden /> : null}
                {byLabel[f.added_by]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
      {canAdd && start && finish ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={pending || full}
            onChange={(e) => {
              void pick(e.currentTarget.files?.[0])
              e.currentTarget.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending || full}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            <PaperclipIcon data-icon="inline-start" />
            {pending ? "Uploading..." : "Add photo or video"}
          </Button>
          <span className="text-xs text-muted-foreground tabular">
            {files.length} of {max}. Photos up to 10 MB, videos up to 50 MB.
          </span>
        </div>
      ) : null}
    </div>
  )
}
