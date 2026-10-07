import "server-only"

type Email = { to: string | string[]; subject: string; text: string; replyTo?: string }

/** Sends through Resend's HTTP API. Logs instead when RESEND_API_KEY is not set. */
export async function sendEmail(email: Email) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.CONTACT_FROM_EMAIL ?? "MultiSims USA <onboarding@resend.dev>"
  if (!key) {
    console.info("[email:dev] would send", { from, ...email })
    return { ok: true as const }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      reply_to: email.replyTo,
    }),
  })
  if (!res.ok) {
    console.error("[email] Resend error", res.status, await res.text())
    return { ok: false as const }
  }
  return { ok: true as const }
}
