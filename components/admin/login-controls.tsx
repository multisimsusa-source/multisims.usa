"use client"

import * as React from "react"
import { KeyIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CopyButton } from "@/components/patterns/copy-button"
import { Notice } from "@/components/patterns/notice"
import type { ActionResult } from "@/lib/admin/result"

/**
 * Login controls shared by the Agents and Dealers pages: create a login, switch it on or
 * off, set a new password. Each takes the page's own server action.
 */

/** A readable random password the owner can pass on (no look-alike characters). */
export function suggestPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, (b) => chars[b % chars.length]).join("")
}

/**
 * After a login is created or a password changed: the exact email and password that were
 * saved, each with a copy button, so what the owner sends is what works. Shown once.
 */
function SavedLogin({ name, email, password, onDone }: { name: string; email?: string; password: string; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="success" title="Saved">
        Send these to {name || "them"} now. The password is not shown again.
      </Notice>
      <dl className="divide-y rounded-lg border">
        {email ? (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="text-sm font-medium break-all">{email}</dd>
            </div>
            <CopyButton value={email} label="email" />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Password</dt>
            <dd className="tabular font-mono text-sm font-medium break-all">{password}</dd>
          </div>
          <CopyButton value={password} label="password" />
        </div>
      </dl>
      <DialogFooter>
        <Button type="button" size="lg" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

export function NewLoginButton({
  label,
  title,
  description,
  submitLabel = "Create login",
  extraFields,
  action,
}: {
  label: string
  title: string
  description: string
  submitLabel?: string
  /** Fields shown after name and email (for example a dealer's company). */
  extraFields?: (errors: Record<string, string>) => React.ReactNode
  action: (formData: FormData) => Promise<ActionResult>
}) {
  const [open, setOpen] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pw, setPw] = React.useState("")
  const [saved, setSaved] = React.useState<{ name: string; email: string; password: string } | null>(null)
  const [pending, start] = React.useTransition()
  const id = React.useId()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setPw(suggestPassword())
          setErrors({})
          setSaved(null)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="lg">
            <PlusIcon weight="bold" data-icon="inline-start" />
            {label}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {saved ? (
          <SavedLogin {...saved} onDone={() => setOpen(false)} />
        ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            start(async () => {
              const result = await action(fd)
              if (!result.ok) {
                setErrors(result.fieldErrors ?? {})
                toast.error(result.error)
                return
              }
              toast.success(result.message ?? "Created")
              setSaved({
                name: String(fd.get("full_name") ?? "").trim(),
                email: String(fd.get("email") ?? "").trim().toLowerCase(),
                password: String(fd.get("password") ?? ""),
              })
            })
          }}
        >
          <Field data-invalid={Boolean(errors.full_name) || undefined}>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input id={`${id}-name`} name="full_name" autoComplete="off" />
            {errors.full_name ? <FieldError>{errors.full_name}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.email) || undefined}>
            <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
            <Input id={`${id}-email`} name="email" type="email" autoComplete="off" />
            {errors.email ? <FieldError>{errors.email}</FieldError> : null}
          </Field>
          {extraFields?.(errors)}
          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
            <div className="flex gap-2">
              <Input
                id={`${id}-password`}
                name="password"
                value={pw}
                onChange={(e) => setPw(e.currentTarget.value)}
                autoComplete="new-password"
                className="font-mono"
              />
              <Button type="button" variant="outline" size="lg" onClick={() => setPw(suggestPassword())}>
                New
              </Button>
            </div>
            {errors.password ? <FieldError>{errors.password}</FieldError> : <FieldDescription>At least 10 characters, no spaces at the start or end. You can copy it after saving.</FieldDescription>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Creating..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function LoginActiveSwitch({
  userId,
  active,
  name,
  action,
}: {
  userId: string
  active: boolean
  name: string
  action: (userId: string, active: boolean) => Promise<ActionResult>
}) {
  const [on, setOn] = React.useState(active)
  const [pending, start] = React.useTransition()
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-8 text-muted-foreground">{on ? "On" : "Off"}</span>
      <Switch
        checked={on}
        disabled={pending}
        aria-label={`${name} can sign in`}
        onCheckedChange={(next) => {
          setOn(next)
          start(async () => {
            const result = await action(userId, next)
            if (!result.ok) {
              setOn(!next)
              toast.error(result.error)
            } else toast.success(result.message ?? "Saved")
          })
        }}
      />
    </label>
  )
}

export function ResetPasswordButton({
  userId,
  name,
  email,
  action,
}: {
  userId: string
  name: string
  /** Shown with the new password, so both can be sent together as after creating the login. */
  email?: string
  action: (userId: string, password: string) => Promise<ActionResult>
}) {
  const [open, setOpen] = React.useState(false)
  const [pw, setPw] = React.useState("")
  const [saved, setSaved] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setPw(suggestPassword())
          setSaved(null)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost">
            <KeyIcon data-icon="inline-start" />
            Password
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New password for {name}</DialogTitle>
          <DialogDescription>Their old password stops working at once. Send them the new one yourself.</DialogDescription>
        </DialogHeader>
        {saved ? (
          <SavedLogin name={name} email={email} password={saved} onDone={() => setOpen(false)} />
        ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const result = await action(userId, pw)
              if (!result.ok) return void toast.error(result.error)
              toast.success(result.message ?? "Changed")
              setSaved(pw)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor={`pw-${userId}`}>New password</FieldLabel>
            <Input id={`pw-${userId}`} value={pw} onChange={(e) => setPw(e.currentTarget.value)} autoComplete="new-password" className="font-mono" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending || pw.length < 10}>
              {pending ? "Saving..." : "Change password"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
