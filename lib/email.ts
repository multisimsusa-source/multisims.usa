import "server-only"

export type EmailAttachment = {
  filename: string
  /** Base64 file content. */
  content: string
  contentType?: string
  /** Set to show the image inline: reference it in HTML as src="cid:<contentId>". */
  contentId?: string
}

type Email = {
  to: string | string[]
  subject: string
  text: string
  html?: string
  replyTo?: string
  /** "orders" for order, delivery, alert and ticket mail; "contact" for the contact form. */
  sender?: "orders" | "contact"
  attachments?: EmailAttachment[]
  /** Resend drops a second send with the same key within 24 hours. */
  idempotencyKey?: string
}

const senders = {
  orders: () => process.env.ORDERS_FROM_EMAIL ?? process.env.CONTACT_FROM_EMAIL ?? "MultiSims USA <onboarding@resend.dev>",
  contact: () => process.env.CONTACT_FROM_EMAIL ?? "MultiSims USA <onboarding@resend.dev>",
}

/** Sends through Resend's HTTP API. Logs instead when RESEND_API_KEY is not set. */
export async function sendEmail(email: Email) {
  const key = process.env.RESEND_API_KEY
  const from = senders[email.sender ?? "contact"]()
  const to = (Array.isArray(email.to) ? email.to : [email.to]).filter(Boolean)
  if (to.length === 0) return { ok: true as const }

  if (!key) {
    console.info("[email:dev] would send", { from, to, subject: email.subject, text: email.text })
    return { ok: true as const }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        reply_to: email.replyTo,
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
          content_id: a.contentId,
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text())
      return { ok: false as const }
    }
    return { ok: true as const }
  } catch (error) {
    console.error("[email] Resend request failed", error)
    return { ok: false as const }
  }
}
