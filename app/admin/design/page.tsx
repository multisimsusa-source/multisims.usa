import type { Metadata } from "next"
import { PaperPlaneTiltIcon, PlusIcon } from "@phosphor-icons/react/ssr"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DetailList, DetailRow } from "@/components/patterns/detail-list"
import { EmptyState } from "@/components/patterns/empty-state"
import { KeyValue, Panel } from "@/components/patterns/panel"
import { Notice } from "@/components/patterns/notice"
import { Reveal } from "@/components/patterns/reveal"
import { Tag } from "@/components/patterns/tag"
import { ProductBadge } from "@/components/site/product-mark"
import { DemoFormSection, DemoSelect, DemoSwitch } from "./demos"

export const metadata: Metadata = { title: "Design system" }

const colors: { group: string; tokens: { name: string; use: string; text?: string }[] }[] = [
  {
    group: "Surfaces and text",
    tokens: [
      { name: "background", use: "Page ground" },
      { name: "canvas", use: "Banded sections, portal ground" },
      { name: "card", use: "Cards, forms, lists" },
      { name: "muted", use: "Quiet fills, inactive chips" },
      { name: "border", use: "1px hairlines" },
      { name: "foreground", use: "Body text", text: "background" },
      { name: "muted-foreground", use: "Secondary text (AA)", text: "background" },
    ],
  },
  {
    group: "Brand",
    tokens: [
      { name: "brand", use: "Primary actions, selection, links", text: "brand-foreground" },
      { name: "brand-soft", use: "eSIM badge, info notices", text: "brand-ink" },
      { name: "copper", use: "Logo tagline, SIM mark. Never an action", text: "copper-foreground" },
      { name: "copper-ink", use: "Copper text at body size", text: "background" },
      { name: "plum", use: "Logo plum, constant across themes", text: "background" },
      { name: "scrim", use: "Under text set on photos", text: "background" },
    ],
  },
  {
    group: "Status (pairs: -soft fill with -ink text)",
    tokens: [
      { name: "success-soft", use: "Delivered, live, saved", text: "success-ink" },
      { name: "warning-soft", use: "Waiting too long, needs a step", text: "warning-ink" },
      { name: "danger-soft", use: "Errors, needs attention", text: "danger-ink" },
    ],
  },
]

/**
 * The design system, rendered from the real tokens and components. DESIGN.md is the
 * rulebook; this page is what those rules look like right now, in both themes.
 */
export default function DesignSystemPage() {
  return (
    <>
      <AdminPageHeader
        title="Design system"
        description="Every token and shared component, rendered live. The rules are in DESIGN.md; anything new is built from these pieces. Switch the theme in the top bar to check dark mode."
      />

      <div className="flex flex-col gap-12">
        <Block title="Colour" note="All colours are tokens in app/globals.css. Screens never use hex, oklch or Tailwind palette colours (the design checker fails the build).">
          {colors.map((g) => (
            <div key={g.group}>
              <h3 className="type-overline mb-3">{g.group}</h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {g.tokens.map((t) => (
                  <li key={t.name} className="overflow-hidden rounded-lg border bg-card">
                    <div
                      className="flex h-16 items-end p-2 font-mono text-xs"
                      style={{ background: `var(--${t.name})`, color: t.text ? `var(--${t.text})` : "var(--foreground)" }}
                    >
                      Aa
                    </div>
                    <div className="p-2.5">
                      <p className="font-mono text-xs font-medium">{t.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.use}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Block>

        <Block title="Type" note="Funnel Display for headings, Geist for everything else, Geist Mono for numbers you compare (prices, order numbers, ICCIDs). Use the role classes, not ad hoc sizes.">
          <div className="divide-y rounded-xl border bg-card">
            <TypeRow role="type-page-title" sample="Checkout" />
            <TypeRow role="type-section-title" sample="Order details" />
            <TypeRow role="type-card-title" sample="Your US number" />
            <TypeRow role="type-overline" sample="Line to get" />
            <TypeRow role="text-base" sample="Your QR code arrives by email and on your order page." />
            <TypeRow role="text-sm text-muted-foreground" sample="Where you will mostly be, for example 10001." />
            <TypeRow role="font-mono tabular" sample="MS-10421  $42.00  8901260123456789012" />
          </div>
        </Block>

        <Block title="Density and controls" note="Inputs, selects and lg buttons take their height from --control-h: 44px on the public site and in dialogs, 40px inside the portals (density-compact on the shell). Never set a control's height by hand.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <p className="type-overline mb-4">Portal, 40px</p>
              <Controls prefix="compact" />
            </div>
            <div className="rounded-xl border bg-card p-5 [--control-h:2.75rem]">
              <p className="type-overline mb-4">Public site and dialogs, 44px</p>
              <Controls prefix="touch" />
            </div>
          </div>
        </Block>

        <Block title="Buttons" note="One primary (plum) action per area. Outline for secondary, ghost for tertiary, destructive tint for deletes. xl is the page's single main action (Place order, Send request).">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-5">
            <Button size="xl">
              <PaperPlaneTiltIcon data-icon="inline-start" weight="bold" />
              Place order
            </Button>
            <Button size="lg">Claim</Button>
            <Button size="lg" variant="outline">
              <PlusIcon data-icon="inline-start" />
              Continue
            </Button>
            <Button size="lg" variant="ghost">
              Release
            </Button>
            <Button size="lg" variant="destructive">
              Cancel order
            </Button>
            <Button size="lg" disabled>
              Disabled
            </Button>
            <Button>Default, 36px</Button>
            <Button size="sm" variant="outline">
              Small
            </Button>
          </div>
        </Block>

        <Block title="Status" note="Tags are small uppercase pills on a soft tint; the word carries the meaning. Customers only ever see Processing, Delivered, Shipped (and Cancelled).">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-5">
            <Tag tone="brand">Processing</Tag>
            <Tag tone="success">Delivered</Tag>
            <Tag tone="success">Shipped</Tag>
            <Tag tone="neutral">Cancelled</Tag>
            <Tag tone="warning">Needs QR</Tag>
            <Tag tone="danger">Needs attention</Tag>
            <ProductBadge type="esim" />
            <ProductBadge type="physical" />
          </div>
        </Block>

        <Block title="Notices" note="Inline messages on a soft tint with an icon. Never a coloured side border. Short form errors drop the icon.">
          <div className="grid gap-3 lg:grid-cols-2">
            <Notice tone="info" title="From the owner">
              Deliver the nearest available area code.
            </Notice>
            <Notice tone="success" title="Order placed">
              We emailed this page&apos;s link to you.
            </Notice>
            <Notice tone="warning" title="Replacement waiting">
              It goes into the queue once you approve it.
            </Notice>
            <Notice tone="danger" icon={false}>
              Please check the highlighted fields.
            </Notice>
          </div>
        </Block>

        <Block title="Forms" note="Long forms are one FormCard split into FormSections by hairlines. Labels above fields, help text below, the error replaces the help text. Examples go in the help text, never as placeholders.">
          <DemoFormSection />
        </Block>

        <Block title="Facts" note="DetailList for a customer-facing summary (one column, no empty cells). Panel with KeyValue for portal side rails.">
          <div className="grid gap-4 lg:grid-cols-2">
            <DetailList>
              <DetailRow label="Order number" value="MS-10421" mono />
              <DetailRow label="Plan" value="T-Mobile Essentials 20 GB" />
              <DetailRow label="Length" value="30 days" />
              <DetailRow label="Total" value="$42.00" mono strong />
            </DetailList>
            <Panel title="Line to get">
              <KeyValue label="Carrier and plan" value="T-Mobile Essentials 20 GB" />
              <KeyValue label="ZIP code" value="10001" mono />
              <KeyValue label="Area code" value="212" mono strong />
            </Panel>
          </div>
        </Block>

        <Block title="Empty states" note="Say why it is empty and what happens next. Filtered-empty and truly-empty use different words.">
          <EmptyState title="No orders yet">Orders appear here as soon as customers check out.</EmptyState>
        </Block>

        <Block
          title="Motion (public site)"
          note="Reveal settles marketing sections in as they scroll into view (rise, fade, un-blur; lists stagger by index, capped at 6). Only blocks that start below the fold are hidden, so nothing flickers and a failed script hides nothing. The home hero's entrance uses the enter and enter-photo classes. Task pages (plans browser, plan page, checkout, order page) stay still, and the portals never use Reveal: this demo is the one exception. Reduced motion keeps the fade only."
        >
          <Reveal as="ol" className="max-w-md rounded-xl border bg-card p-5">
            {["Choose", "Pay", "Connect"].map((step, i, all) => (
              <li key={step} className="relative grid grid-cols-[2rem_1fr] items-center gap-x-4 py-3">
                {i < all.length - 1 ? (
                  <span
                    aria-hidden
                    style={{ transitionDelay: `${300 + i * 450}ms` }}
                    className="reveal-draw absolute top-11 -bottom-3 left-4 w-px bg-brand"
                  />
                ) : null}
                <span
                  aria-hidden
                  style={{ transitionDelay: `${150 + i * 450}ms` }}
                  className="reveal-mark relative flex size-8 items-center justify-center rounded-full border bg-background font-mono text-sm text-copper-ink tabular"
                >
                  {i + 1}
                </span>
                <span className="font-medium">{step}</span>
              </li>
            ))}
          </Reveal>
        </Block>
      </div>
    </>
  )
}

function Controls({ prefix }: { prefix: string }) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor={`${prefix}-name`}>Full name</FieldLabel>
        <Input id={`${prefix}-name`} defaultValue="Ama Perera" />
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor={`${prefix}-zip`}>US ZIP code</FieldLabel>
        <Input id={`${prefix}-zip`} aria-invalid defaultValue="100" className="font-mono tabular" />
        <FieldError>Enter a 5-digit US ZIP code</FieldError>
      </Field>
      <Field>
        <FieldLabel>State</FieldLabel>
        <DemoSelect />
        <FieldDescription>Selects match inputs exactly.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-message`}>Message</FieldLabel>
        <Textarea id={`${prefix}-message`} rows={2} defaultValue="I land in two hours." />
      </Field>
      <div className="flex items-center gap-3">
        <Button size="lg">Save</Button>
        <Button size="lg" variant="outline">
          Cancel
        </Button>
        <DemoSwitch />
      </div>
    </div>
  )
}

function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="type-section-title">{title}</h2>
      <p className="mt-1 mb-5 max-w-[70ch] text-sm text-muted-foreground">{note}</p>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  )
}

function TypeRow({ role, sample }: { role: string; sample: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6">
      <code className="w-56 shrink-0 font-mono text-xs text-muted-foreground">{role}</code>
      <p className={role}>{sample}</p>
    </div>
  )
}
