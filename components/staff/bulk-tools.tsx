"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { UploadSimpleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Notice } from "@/components/patterns/notice"
import { saveItemDetailsBulk, saveItemQr } from "@/app/agent/actions"
import { cn } from "@/lib/utils"

const ACCEPT = ["image/png", "image/jpeg", "image/webp"]
const MAX_BYTES = 2 * 1024 * 1024
const naturally = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

type BulkItem = { id: string; seq: number; hasQr: boolean }

/**
 * Big orders on the fulfilment screen: drop all the QR images at once (matched to SIMs in
 * file name order), and paste every phone number and ICCID in one go.
 */
export function BulkTools({ orderId, items, qr }: { orderId: string; items: BulkItem[]; qr: boolean }) {
  return (
    <section aria-labelledby="bulk-title" className="divide-y rounded-xl border bg-background">
      <div className="p-4 sm:p-5">
        <h2 id="bulk-title" className="type-card-title">
          Bulk tools
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          For {items.length} SIMs. Fill them all at once here, or one by one below.
        </p>
      </div>
      {qr ? <BulkQr items={items.filter((i) => !i.hasQr)} total={items.length} /> : null}
      <BulkDetails orderId={orderId} count={items.length} />
    </section>
  )
}

type Upload = { file: File; item: BulkItem; state: "waiting" | "done" | "failed"; error?: string }

function BulkQr({ items, total }: { items: BulkItem[]; total: number }) {
  const router = useRouter()
  const [uploads, setUploads] = React.useState<Upload[]>([])
  const [skipped, setSkipped] = React.useState<string[]>([])
  const [dragging, setDragging] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const inputId = React.useId()

  if (!items.length && !uploads.length) {
    return <p className="p-4 text-sm text-muted-foreground sm:p-5">Every SIM has its QR code.</p>
  }

  const choose = (list: FileList | null) => {
    if (!list?.length) return
    const files = [...list].sort((a, b) => naturally.compare(a.name, b.name))
    const bad = files.filter((f) => !ACCEPT.includes(f.type) || f.size > MAX_BYTES)
    const good = files.filter((f) => !bad.includes(f))
    setSkipped([...bad.map((f) => `${f.name} (not a PNG, JPG or WebP under 2 MB)`), ...good.slice(items.length).map((f) => `${f.name} (more images than SIMs)`)])
    setUploads(good.slice(0, items.length).map((file, i) => ({ file, item: items[i], state: "waiting" })))
  }

  const run = async (only?: Upload[]) => {
    setRunning(true)
    const list = only ?? uploads
    for (const u of list) {
      const fd = new FormData()
      fd.set("qr", u.file)
      const result = await saveItemQr(u.item.id, fd)
      setUploads((all) => all.map((x) => (x.item.id === u.item.id ? { ...x, state: result.ok ? "done" : "failed", error: result.ok ? undefined : result.error } : x)))
    }
    setRunning(false)
    router.refresh()
  }

  const done = uploads.filter((u) => u.state === "done").length
  const failed = uploads.filter((u) => u.state === "failed")
  const finished = uploads.length > 0 && done + failed.length === uploads.length

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium">QR codes</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {items.length} of {total} SIMs still need one. Images are matched in file name order: the first file to the first SIM without a QR.
        </p>
      </div>

      {!uploads.length ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            choose(e.dataTransfer.files)
          }}
          className={cn(
            "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            dragging ? "border-primary bg-brand-soft" : "hover:bg-muted"
          )}
        >
          <UploadSimpleIcon className="size-5 text-muted-foreground" />
          <span className="font-medium">Drop all the QR images here</span>
          <span className="text-muted-foreground">or pick them from your files</span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT.join(",")}
            multiple
            className="sr-only"
            onChange={(e) => {
              choose(e.currentTarget.files)
              e.currentTarget.value = ""
            }}
          />
        </label>
      ) : (
        <>
          <ol className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
            {uploads.map((u) => (
              <li key={u.item.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-14 shrink-0 font-medium tabular">SIM {u.item.seq}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{u.file.name}</span>
                <span className={cn("shrink-0 text-xs", u.state === "done" && "text-success-ink", u.state === "failed" && "text-danger-ink")}>
                  {u.state === "done" ? "Saved" : u.state === "failed" ? (u.error ?? "Failed") : running ? "Waiting" : "Ready"}
                </span>
              </li>
            ))}
          </ol>
          {skipped.length ? (
            <Notice tone="warning" title={`${skipped.length} ${skipped.length === 1 ? "file" : "files"} left out`}>
              {skipped.slice(0, 5).join(", ")}
              {skipped.length > 5 ? ` and ${skipped.length - 5} more` : ""}
            </Notice>
          ) : null}
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {running || finished ? (
              <>
                Uploaded <span className="font-mono text-foreground tabular">{done}</span> of <span className="font-mono tabular">{uploads.length}</span>
                {failed.length ? `, ${failed.length} failed` : ""}
              </>
            ) : (
              `${uploads.length} images ready for ${uploads.length} SIMs. Check the order above, then upload.`
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {!finished ? (
              <Button type="button" size="lg" disabled={running} onClick={() => run()}>
                {running ? "Uploading..." : `Upload ${uploads.length} QR ${uploads.length === 1 ? "code" : "codes"}`}
              </Button>
            ) : null}
            {finished && failed.length ? (
              <Button type="button" size="lg" disabled={running} onClick={() => run(failed)}>
                Try the {failed.length} failed again
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              variant="ghost"
              disabled={running}
              onClick={() => {
                setUploads([])
                setSkipped([])
              }}
            >
              {finished ? "Done" : "Choose other files"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function BulkDetails({ orderId, count }: { orderId: string; count: number }) {
  const [text, setText] = React.useState("")
  const [pending, start] = React.useTransition()
  const id = React.useId()
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length
  return (
    <form
      className="flex flex-col gap-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const result = await saveItemDetailsBulk(orderId, text)
          if (!result.ok) return void toast.error(result.error)
          toast.success(result.message ?? "Saved")
          setText("")
        })
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>Phone numbers and ICCIDs</FieldLabel>
        <Textarea id={id} rows={5} value={text} onChange={(e) => setText(e.currentTarget.value)} className="font-mono text-sm" spellCheck={false} />
        <FieldDescription>
          One line per SIM, in SIM order: phone number and ICCID, separated by a comma or tab. Pasting two columns from a spreadsheet works.{" "}
          {lines ? (
            <span className={cn("tabular", lines > count && "text-danger-ink")}>
              {lines} of {count} lines.
            </span>
          ) : null}
        </FieldDescription>
      </Field>
      <Button type="submit" size="lg" variant="outline" className="w-full sm:w-fit" disabled={pending || !lines || lines > count}>
        {pending ? "Saving..." : "Save details"}
      </Button>
    </form>
  )
}
