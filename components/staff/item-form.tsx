"use client"

import * as React from "react"
import { CheckCircleIcon, ClipboardTextIcon, QrCodeIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tag } from "@/components/patterns/tag"
import { saveItem } from "@/app/agent/actions"
import { itemStatusLabel } from "@/lib/orders"
import type { ProductType } from "@/lib/types"
import type { WorkItem } from "@/lib/staff/queries"
import { cn } from "@/lib/utils"

const ACCEPT = ["image/png", "image/jpeg", "image/webp"]

/** What this SIM still needs: its QR (eSIM), ICCID and tracking (posting), or its number (activation). */
export type ItemNeed = "qr" | "ship" | "activate"

type Props = { item: WorkItem; productType: ProductType; need: ItemNeed; editable: boolean; title: string }

const needLabel: Record<ItemNeed, string> = { qr: "Needs QR", ship: "Needs ICCID and tracking", activate: "Needs phone number" }

export function itemReady(item: Pick<WorkItem, "qr_path" | "tracking_number" | "iccid" | "phone_number">, need: ItemNeed) {
  if (need === "qr") return Boolean(item.qr_path)
  if (need === "ship") return Boolean(item.tracking_number && item.iccid)
  return Boolean(item.phone_number)
}

/**
 * One SIM on the fulfilment screen. eSIM: the QR image (required) plus phone number
 * and ICCID. Physical: phone number and ICCID; the tracking number is set once for the
 * parcel. QR images can be dropped, picked, or pasted straight from WhatsApp.
 */
export function ItemForm({ item, productType, need, editable, title }: Props) {
  const esim = productType === "esim"
  const [file, setFile] = React.useState<File | null>(null)
  const preview = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  const [dragging, setDragging] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [pending, start] = React.useTransition()
  const inputId = React.useId()

  React.useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const pick = (f: File | null | undefined) => {
    if (!f) return
    if (!ACCEPT.includes(f.type)) return toast.error("Use a PNG, JPG or WebP image")
    if (f.size > 2 * 1024 * 1024) return toast.error("That image is over 2 MB")
    setFile(f)
    setDirty(true)
    setErrors((e) => ({ ...e, qr: "" }))
  }

  const ready = itemReady(item, need)
  const working = item.status === "pending" || (need === "activate" && item.status === "fulfilled")
  const shown = preview ?? item.qr_url

  return (
    <form
      className="rounded-xl border bg-background"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        if (file) fd.set("qr", file)
        fd.set("tracking_number", item.tracking_number ?? "")
        start(async () => {
          const result = await saveItem(item.id, fd)
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {})
            toast.error(result.error)
            return
          }
          setErrors({})
          setFile(null)
          setDirty(false)
          toast.success(result.message ?? "Saved")
        })
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3>
        {working ? (
          ready ? (
            <Tag tone="success">
              <CheckCircleIcon weight="fill" className="mr-1 size-3" />
              Ready
            </Tag>
          ) : (
            <Tag tone="warning">{needLabel[need]}</Tag>
          )
        ) : (
          <Tag tone={item.status === "fulfilled" ? "success" : "neutral"}>{itemStatusLabel[item.status]}</Tag>
        )}
      </div>

      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        {esim ? (
          <div className="w-full shrink-0 sm:w-auto">
            {editable ? (
              <label
                htmlFor={inputId}
                tabIndex={0}
                onPaste={(e) => pick([...e.clipboardData.files][0])}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  pick(e.dataTransfer.files[0])
                }}
                className={cn(
                  "relative mx-auto flex aspect-square w-full max-w-64 cursor-pointer flex-col sm:size-44 items-center justify-center gap-2 overflow-hidden rounded-lg border text-center text-sm outline-none transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  shown ? "bg-white" : "border-dashed text-muted-foreground hover:border-foreground/30 hover:bg-muted/50",
                  dragging && "border-primary bg-brand-soft",
                  errors.qr && "border-destructive"
                )}
              >
                {shown ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shown} alt={`QR code for ${title}`} className="size-full object-contain p-2" />
                ) : (
                  <>
                    <UploadSimpleIcon className="size-6" />
                    <span className="px-3 pointer-coarse:hidden">
                      Drop, click or paste
                      <br />
                      the QR image
                    </span>
                    <span className="hidden px-3 pointer-coarse:inline">Tap to add the QR image</span>
                  </>
                )}
                {preview ? (
                  <span className="absolute inset-x-0 bottom-0 bg-warning-soft py-1 text-xs font-medium text-warning-ink">Not saved yet</span>
                ) : null}
              </label>
            ) : shown ? (
              <a href={shown} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown} alt={`QR code for ${title}`} className="mx-auto aspect-square w-full max-w-64 rounded-lg border bg-white object-contain p-2 sm:size-44" />
              </a>
            ) : (
              <div className="mx-auto flex aspect-square w-full max-w-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground sm:size-44">
                <QrCodeIcon className="size-6" />
                No QR yet
              </div>
            )}
            <input id={inputId} type="file" accept={ACCEPT.join(",")} className="sr-only" disabled={!editable} onChange={(e) => pick(e.currentTarget.files?.[0])} />
            {editable ? (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground pointer-coarse:hidden sm:justify-start">
                <ClipboardTextIcon className="size-3.5" /> Ctrl/Cmd+V after clicking the box
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid min-w-0 flex-1 content-start gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.phone_number) || undefined}>
            <FieldLabel htmlFor={`${item.id}-phone`}>Phone number</FieldLabel>
            <Input
              id={`${item.id}-phone`}
              name="phone_number"
              inputMode="tel"
              autoComplete="off"
              defaultValue={item.phone_number ?? ""}
              disabled={!editable}
              onChange={() => setDirty(true)}
              className="font-mono tabular"
            />
            {errors.phone_number ? <FieldError>{errors.phone_number}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.iccid) || undefined}>
            <FieldLabel htmlFor={`${item.id}-iccid`}>ICCID</FieldLabel>
            <Input
              id={`${item.id}-iccid`}
              name="iccid"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={item.iccid ?? ""}
              disabled={!editable}
              onChange={() => setDirty(true)}
              className="font-mono tabular"
            />
            {errors.iccid ? <FieldError>{errors.iccid}</FieldError> : null}
          </Field>
          {!esim && item.tracking_number ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Tracking <span className="font-mono text-foreground">{item.tracking_number}</span>
            </p>
          ) : null}
          {editable ? (
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" variant={dirty ? "default" : "outline"} disabled={pending || !dirty}>
                {pending ? "Saving..." : file ? "Save QR and details" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  )
}
