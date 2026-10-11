"use client"

import * as React from "react"
import { KeyIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { createAgent, resetAgentPassword, setAgentActive } from "./actions"

/** A readable random password the owner can pass on (no look-alike characters). */
function suggestPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, (b) => chars[b % chars.length]).join("")
}

export function NewAgentButton() {
  const [open, setOpen] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pw, setPw] = React.useState("")
  const [pending, start] = React.useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setPw(suggestPassword())
          setErrors({})
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="lg">
            <PlusIcon weight="bold" data-icon="inline-start" />
            New agent
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New agent login</DialogTitle>
          <DialogDescription>They sign in at Portal Login with this email and password. We email them the link; send the password yourself.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            start(async () => {
              const result = await createAgent(fd)
              if (!result.ok) {
                setErrors(result.fieldErrors ?? {})
                toast.error(result.error)
                return
              }
              toast.success(result.message ?? "Created")
              setOpen(false)
            })
          }}
        >
          <Field data-invalid={Boolean(errors.full_name) || undefined}>
            <FieldLabel htmlFor="agent-name">Name</FieldLabel>
            <Input id="agent-name" name="full_name" autoComplete="off" />
            {errors.full_name ? <FieldError>{errors.full_name}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.email) || undefined}>
            <FieldLabel htmlFor="agent-email">Email</FieldLabel>
            <Input id="agent-email" name="email" type="email" autoComplete="off" />
            {errors.email ? <FieldError>{errors.email}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor="agent-password">Password</FieldLabel>
            <div className="flex gap-2">
              <Input id="agent-password" name="password" value={pw} onChange={(e) => setPw(e.currentTarget.value)} autoComplete="new-password" className="font-mono" />
              <Button type="button" variant="outline" size="lg" onClick={() => setPw(suggestPassword())}>
                New
              </Button>
            </div>
            {errors.password ? <FieldError>{errors.password}</FieldError> : <FieldDescription>At least 10 characters. Copy it before you save.</FieldDescription>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Creating..." : "Create login"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AgentActiveSwitch({ agentId, active, name }: { agentId: string; active: boolean; name: string }) {
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
            const result = await setAgentActive(agentId, next)
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

export function ResetPasswordButton({ agentId, name }: { agentId: string; name: string }) {
  const [open, setOpen] = React.useState(false)
  const [pw, setPw] = React.useState("")
  const [pending, start] = React.useTransition()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setPw(suggestPassword())
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
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const result = await resetAgentPassword(agentId, pw)
              if (!result.ok) return void toast.error(result.error)
              toast.success(result.message ?? "Changed")
              setOpen(false)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor={`pw-${agentId}`}>New password</FieldLabel>
            <Input id={`pw-${agentId}`} value={pw} onChange={(e) => setPw(e.currentTarget.value)} autoComplete="new-password" className="font-mono" />
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
      </DialogContent>
    </Dialog>
  )
}
