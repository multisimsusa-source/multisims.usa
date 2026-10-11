// Unclaimed-order alert. Called every minute by pg_cron (see migration
// 20261010000002_unclaimed_alert_cron.sql) but only when an order is overdue.
// Emails the owner about orders nobody has claimed within settings.unclaimed_alert_minutes
// so he can call his agents. Each order alerts once (take_unclaimed_alerts records it).
//
// Secrets (supabase secrets set ...): CRON_SECRET, RESEND_API_KEY, ORDERS_FROM_EMAIL,
// SITE_URL, and optionally OWNER_EMAIL as a fallback when settings.owner_email is empty.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from "jsr:@supabase/supabase-js@2"

type Due = { order_id: string; number: number; paid_at: string; plan: string; quantity: number }

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET")
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("forbidden", { status: 403 })
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: due, error } = await db.rpc("take_unclaimed_alerts")
  if (error) {
    console.error("take_unclaimed_alerts failed", error)
    return new Response("error", { status: 500 })
  }
  const orders = (due ?? []) as Due[]
  if (orders.length === 0) return Response.json({ sent: 0 })

  const { data: settings } = await db.from("settings").select("owner_email, unclaimed_alert_minutes").maybeSingle()
  const to = (settings?.owner_email || Deno.env.get("OWNER_EMAIL") || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
  if (to.length === 0) {
    console.warn("unclaimed orders but no owner email set", orders.map((o) => o.number))
    return Response.json({ sent: 0, reason: "no owner email" })
  }

  const site = (Deno.env.get("SITE_URL") ?? "https://multisimsusa.com").replace(/\/$/, "")
  const minutes = settings?.unclaimed_alert_minutes ?? 5
  const label = (o: Due) => `MS-${o.number}`
  const waited = (o: Due) => Math.max(minutes, Math.round((Date.now() - new Date(o.paid_at).getTime()) / 60_000))

  const subject =
    orders.length === 1
      ? `No agent has claimed ${label(orders[0])} (${waited(orders[0])} min)`
      : `${orders.length} orders waiting with no agent`
  const lines = orders.map((o) => `${label(o)}: ${o.quantity} x ${o.plan}, waiting ${waited(o)} min. ${site}/admin/orders/${o.order_id}`)
  const text = `Nobody has claimed ${orders.length === 1 ? "this order" : "these orders"} after ${minutes} minutes. The customer still sees Processing.\n\n${lines.join("\n")}\n\nOpen the queue: ${site}/agent`
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f6f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2b2230;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e2ea;border-radius:12px;">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e6e2ea;"><span style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3a1039;">MSU</span> <span style="font-size:11px;font-weight:600;letter-spacing:2px;color:#a3753f;">MULTISIMS.USA</span></td></tr>
<tr><td style="padding:28px;"><h1 style="margin:0 0 12px;font-size:22px;">${esc(subject)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Nobody has claimed ${orders.length === 1 ? "this order" : "these orders"} after ${minutes} minutes. The customer still sees Processing.</p>
${orders
  .map(
    (o) =>
      `<p style="margin:0 0 10px;font-size:14px;"><a href="${site}/admin/orders/${o.order_id}" style="color:#3a1039;font-weight:600;">${label(o)}</a> &middot; ${o.quantity} x ${esc(o.plan)} &middot; waiting ${waited(o)} min</p>`
  )
  .join("")}
<p style="margin:24px 0 0;"><a href="${site}/agent" style="display:inline-block;background:#3a1039;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">Open the queue</a></p>
</td></tr></table></body></html>`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `unclaimed-${orders.map((o) => o.order_id).sort().join("-")}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: Deno.env.get("ORDERS_FROM_EMAIL") ?? "MultiSims USA <orders@multisimsusa.com>",
      to,
      subject,
      text,
      html,
    }),
  })
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text())
    return new Response("email failed", { status: 502 })
  }
  return Response.json({ sent: orders.length })
})
