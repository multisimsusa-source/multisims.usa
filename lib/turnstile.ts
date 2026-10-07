import "server-only"

/** Verifies a Cloudflare Turnstile token. Passes when Turnstile is not configured. */
export async function verifyTurnstile(token: string | null, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false

  const body = new FormData()
  body.set("secret", secret)
  body.set("response", token)
  if (ip) body.set("remoteip", ip)

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  })
  const data = (await res.json()) as { success?: boolean }
  return data.success === true
}
