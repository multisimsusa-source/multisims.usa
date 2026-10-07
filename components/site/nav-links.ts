export const navLinks = [
  { href: "/plans", label: "Plans" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const

/** A section is current on its own page and on every page under it (/plans/x counts as Plans). */
export function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
