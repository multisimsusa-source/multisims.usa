export const site = {
  name: "MultiSims USA",
  domain: "multisimsusa.com",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  description:
    "US SIM cards and eSIMs from T-Mobile, Verizon, AT&T and more. Pick your carrier and days, pay, and get connected.",
} as const

export function absoluteUrl(path = "/") {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`
}
