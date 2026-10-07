"use server"

import { headers } from "next/headers"
import { z } from "zod"

import { sendEmail } from "@/lib/email"
import { rateLimit } from "@/lib/rate-limit"
import { verifyTurnstile } from "@/lib/turnstile"

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email address").max(200),
  order: z.string().trim().max(60).optional(),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more, at least 10 characters")
    .max(4000, "Keep your message under 4,000 characters"),
})

export type ContactState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error"
      message: string
      fieldErrors?: Partial<Record<keyof z.infer<typeof schema>, string>>
      values?: Record<string, string>
    }

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    order: String(formData.get("order") ?? ""),
    message: String(formData.get("message") ?? ""),
  }

  // Honeypot: real people never fill this hidden field.
  if (formData.get("company")) return { status: "success" }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip")
  if (!(await rateLimit(`contact:${ip ?? "unknown"}`, 5, 10 * 60_000)).ok) {
    return { status: "error", message: "Too many messages. Please try again in a few minutes.", values }
  }

  const human = await verifyTurnstile(formData.get("cf-turnstile-response") as string | null, ip ?? null)
  if (!human) {
    return { status: "error", message: "Please complete the verification and try again.", values }
  }

  const parsed = schema.safeParse({ ...values, order: values.order || undefined })
  if (!parsed.success) {
    const fieldErrors: NonNullable<Extract<ContactState, { status: "error" }>["fieldErrors"]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof typeof fieldErrors
      fieldErrors[key] ??= issue.message
    }
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors, values }
  }

  const { name, email, order, message } = parsed.data
  const to = process.env.CONTACT_TO_EMAIL
  const result = await sendEmail({
    to: to ? to.split(",").map((s) => s.trim()) : ["owner@multisimsusa.com"],
    subject: `Website message from ${name}`,
    replyTo: email,
    text: [`From: ${name} <${email}>`, order ? `Order: ${order}` : null, "", message]
      .filter((l) => l !== null)
      .join("\n"),
  })
  if (!result.ok) {
    return { status: "error", message: "We could not send your message. Please try again.", values }
  }
  return { status: "success" }
}
