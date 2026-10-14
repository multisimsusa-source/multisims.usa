"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

const SOUND_KEY = "msu:alert-sound"

type OrderRow = {
  id: string
  number: number
  status: string
  carrier_name: string
  plan_name: string
  quantity: number
  replacement_of: string | null
  phase: "fulfil" | "activate"
}
type TicketRow = { id: string; number: number; type_name: string; severity: string }

/**
 * New-order alerts for agents (and the owner). Supabase Realtime pushes order changes
 * (RLS decides what each person receives). A job entering the queue rings a chime,
 * shows a toast and, when the tab is in the background, a system notification. Pages
 * showing lists re-render so the queue is always current.
 *
 * Browsers block audio until the person interacts with the page, so sound is behind
 * an "Enable sound" switch turned on at the start of a shift. The choice is remembered
 * per browser; after a reload the first tap anywhere re-arms it.
 */
export function OrderAlerts({ queuedKeys }: { queuedKeys: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sound = React.useSyncExternalStore(subscribeSound, readSound, () => false)
  const [live, setLive] = React.useState<"connecting" | "live" | "offline">("connecting")
  const audio = React.useRef<AudioContext | null>(null)
  // Keyed by order and phase: a posted SIM card comes back to the queue to be activated.
  const seen = React.useRef(new Set(queuedKeys))
  const soundRef = React.useRef(false)
  const pathRef = React.useRef(pathname)
  const refreshTimer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  React.useEffect(() => {
    for (const key of queuedKeys) seen.current.add(key)
  }, [queuedKeys])

  // A remembered "on" still needs a gesture before the browser lets audio play.
  React.useEffect(() => {
    soundRef.current = sound
    if (!sound || audio.current?.state === "running") return
    const arm = () => {
      ensureAudio(audio)
      window.removeEventListener("pointerdown", arm)
      window.removeEventListener("keydown", arm)
    }
    window.addEventListener("pointerdown", arm)
    window.addEventListener("keydown", arm)
    return () => {
      window.removeEventListener("pointerdown", arm)
      window.removeEventListener("keydown", arm)
    }
  }, [sound])

  const scheduleRefresh = React.useCallback(() => {
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => {
      const path = pathRef.current
      // Lists only: never re-render a screen where someone is typing into a form.
      if (/^\/(agent|admin)(\/orders|\/tickets)?\/?$/.test(path) || path === "/admin") router.refresh()
    }, 400)
  }, [router])

  React.useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("staff-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as Partial<OrderRow>
        const key = `${row?.id}:${row?.phase ?? "fulfil"}`
        if (row?.id && row.status === "queued" && !seen.current.has(key)) {
          seen.current.add(key)
          announceOrder(row as OrderRow)
        }
        scheduleRefresh()
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, (payload) => {
        const t = payload.new as TicketRow
        announce({
          title: `New ticket #${t.number}`,
          body: `${t.type_name}, ${t.severity} priority`,
          href: `${pathRef.current.startsWith("/admin") ? "/admin" : "/agent"}/tickets/${t.id}`,
          tag: `ticket-${t.id}`,
        })
        scheduleRefresh()
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED" ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "offline" : "connecting")
      })

    function announceOrder(order: OrderRow) {
      announce({
        title: `${order.phase === "activate" ? "Activate" : order.replacement_of ? "Replacement" : "New order"} MS-${order.number}`,
        body: `${order.quantity} x ${order.carrier_name} ${order.plan_name}`,
        href: `/agent/orders/${order.id}`,
        tag: `order-${order.id}`,
      })
    }

    function announce({ title, body, href, tag }: { title: string; body: string; href: string; tag: string }) {
      if (soundRef.current) chime(audio)
      toast(title, { description: body, duration: 15_000, action: { label: "Open", onClick: () => router.push(href) } })
      if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, tag, icon: "/icon" })
        n.onclick = () => {
          window.focus()
          router.push(href)
          n.close()
        }
      }
    }

    return () => {
      window.clearTimeout(refreshTimer.current)
      supabase.removeChannel(channel)
    }
  }, [router, scheduleRefresh])

  const toggle = (on: boolean) => {
    soundRef.current = on
    writeSound(on)
    if (on) {
      ensureAudio(audio)
      chime(audio)
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission()
    }
  }

  const liveLabel = live === "live" ? "Live: new orders appear instantly" : live === "offline" ? "Offline: reload the page" : "Connecting"

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              aria-label={liveLabel}
              className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              live === "live" ? "bg-success-ink" : live === "offline" ? "bg-destructive" : "bg-warning-ink motion-safe:animate-pulse"
            )}
          />
          <span className="max-sm:hidden">{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</span>
        </TooltipTrigger>
        <TooltipContent>{liveLabel}</TooltipContent>
      </Tooltip>
      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
        {sound ? <SpeakerHighIcon className="size-4" /> : <SpeakerSlashIcon className="size-4 text-muted-foreground" />}
        <span className="max-sm:sr-only">Enable sound</span>
        <Switch checked={sound} onCheckedChange={toggle} aria-label="Enable sound for new orders" />
      </label>
    </div>
  )
}

// The sound preference lives in localStorage, read through a tiny external store so the
// server render (always off) and the browser agree during hydration.
const soundListeners = new Set<() => void>()
function subscribeSound(onChange: () => void) {
  soundListeners.add(onChange)
  return () => soundListeners.delete(onChange)
}
function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) === "on"
  } catch {
    return false
  }
}
function writeSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off")
  } catch {}
  for (const l of soundListeners) l()
}

function ensureAudio(ref: React.RefObject<AudioContext | null>) {
  try {
    ref.current ??= new AudioContext()
    if (ref.current.state === "suspended") void ref.current.resume()
  } catch {}
}

/** Two short rising tones, synthesised so there is no audio file to load. */
function chime(ref: React.RefObject<AudioContext | null>) {
  const ctx = ref.current
  if (!ctx || ctx.state !== "running") return
  const start = ctx.currentTime + 0.02
  for (const [i, freq] of [880, 1318.5].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    const t = start + i * 0.18
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.55)
  }
}
