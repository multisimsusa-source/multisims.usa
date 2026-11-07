"use client"

import * as React from "react"
import { ImageIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { ActionResult } from "@/lib/admin/result"

export type UploadedPhoto = { id: string; url: string }

const ACCEPT = ["image/png", "image/jpeg", "image/gif", "image/webp"]

/**
 * Photos added to an order (the IMEI, EID or SIM card screen), shown as square thumbnails
 * that open full size, with one Add photo button. Uploads one file per request (5 MB).
 */
export function PhotoUpload({
  photos,
  max,
  canAdd,
  upload,
  label = "Add photo",
}: {
  photos: UploadedPhoto[]
  max: number
  canAdd: boolean
  upload?: (formData: FormData) => Promise<ActionResult>
  label?: string
}) {
  const inputId = React.useId()
  const [pending, start] = React.useTransition()
  const full = photos.length >= max

  const pick = (file: File | undefined) => {
    if (!file || !upload) return
    if (!ACCEPT.includes(file.type)) return void toast.error("Use a PNG, JPG, GIF or WebP image")
    if (file.size > 5 * 1024 * 1024) return void toast.error("That image is over 5 MB")
    const fd = new FormData()
    fd.set("photo", file)
    start(async () => {
      const result = await upload(fd)
      if (!result.ok) return void toast.error(result.error)
      toast.success(result.message ?? "Photo added")
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p, i) => (
            <li key={p.id}>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Photo ${i + 1}, opens full size`}
                className="block overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {/* Signed, short-lived URL: next/image would cache it under a public key. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="aspect-square w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="size-4" /> No photos yet.
        </p>
      )}
      {canAdd && upload ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={inputId}
            type="file"
            accept={ACCEPT.join(",")}
            className="sr-only"
            disabled={pending || full}
            onChange={(e) => {
              pick(e.currentTarget.files?.[0])
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
            <PlusIcon data-icon="inline-start" />
            {pending ? "Uploading..." : label}
          </Button>
          <span className="text-xs text-muted-foreground tabular">
            {photos.length} of {max}
          </span>
        </div>
      ) : null}
    </div>
  )
}
