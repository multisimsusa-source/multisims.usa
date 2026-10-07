import { Suspense } from "react"
import Link from "next/link"
import { cacheLife } from "next/cache"
import { ArrowRightIcon, ArrowUpIcon, CurrencyBtcIcon, CurrencyDollarIcon } from "@phosphor-icons/react/ssr"

import { Wordmark } from "@/components/site/wordmark"
import { getActiveCarriers, getPublishedPlans } from "@/lib/catalog"

type FooterLink = { href: string; label: string }

const shop: FooterLink[] = [
  { href: "/plans?type=esim", label: "eSIM plans" },
  { href: "/plans?type=physical", label: "SIM card plans" },
  { href: "/plans", label: "All plans" },
]
const help: FooterLink[] = [
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact us" },
  { href: "/about", label: "About us" },
]
const business: FooterLink[] = [
  { href: "/contact", label: "Dealer accounts" },
  { href: "/portal/login", label: "Portal Login" },
]

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t bg-canvas">
      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr] lg:gap-16">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              US SIM cards and eSIMs on the major American networks, for visitors and dealers.
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
            >
              Questions? Contact us
              <ArrowRightIcon weight="bold" aria-hidden className="size-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            <FooterColumn title="Shop" links={shop} />
            <Suspense fallback={<FooterColumn title="Carriers" links={[]} />}>
              <CarrierColumn />
            </Suspense>
            <FooterColumn title="Help" links={help} />
            <FooterColumn title="For business" links={business} />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Pay in crypto</p>
          <ul aria-label="Payment methods" className="flex flex-wrap gap-2">
            <PaymentTag icon={<CurrencyDollarIcon weight="bold" className="size-4" />} label="USDT" note="TRC-20" />
            <PaymentTag icon={<CurrencyBtcIcon weight="bold" className="size-4" />} label="Bitcoin" />
          </ul>
        </div>
      </div>

      {/* The lockup set large as a quiet signature; the real logo sits top left. */}
      <p
        aria-hidden
        className="pointer-events-none mx-auto mt-10 max-w-6xl px-4 font-logo text-[clamp(1.5rem,calc((100vw-3rem)/9.4),7.25rem)] leading-[0.8] font-extrabold tracking-[0.04em] whitespace-nowrap text-brand/[0.07] select-none sm:px-6 dark:text-brand/[0.09] [font-variation-settings:'opsz'_24]"
      >
        MULTISIMS.USA
      </p>

      <div className="relative border-t bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            &copy; <CopyrightYear /> MultiSims USA. Carrier names and logos belong to their owners.
          </p>
          <a
            href="#main"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 hover:text-foreground sm:min-h-9"
          >
            Back to top
            <ArrowUpIcon weight="bold" aria-hidden className="size-3.5" />
          </a>
        </div>
      </div>
    </footer>
  )
}

/** Carriers with at least one live plan, in the admin's display order. */
async function CarrierColumn() {
  const [carriers, plans] = await Promise.all([getActiveCarriers(), getPublishedPlans()])
  const links = carriers
    .filter((c) => plans.some((p) => p.carrier.id === c.id))
    .map((c) => ({ href: `/plans?carrier=${c.slug}`, label: c.name }))
  return <FooterColumn title="Carriers" links={links} />
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="font-sans text-sm font-medium tracking-normal">{title}</h2>
      <ul className="mt-2 sm:mt-3 sm:space-y-0.5">
        {links.map((l) => (
          <li key={`${l.href}-${l.label}`}>
            <Link
              href={l.href}
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors sm:min-h-9 hover:text-foreground focus-visible:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function PaymentTag({ icon, label, note }: { icon: React.ReactNode; label: string; note?: string }) {
  return (
    <li className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm">
      <span aria-hidden className="text-muted-foreground">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      {note ? <span className="font-mono text-xs text-muted-foreground">{note}</span> : null}
    </li>
  )
}

async function CopyrightYear() {
  "use cache"
  cacheLife("days")
  return new Date().getFullYear()
}
