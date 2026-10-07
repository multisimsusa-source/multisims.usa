import type { Metadata } from "next"
import Image, { type StaticImageData } from "next/image"
import Link from "next/link"
import {
  AndroidLogoIcon,
  AppleLogoIcon,
  ArrowRightIcon,
  CellTowerIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
  QrCodeIcon,
  SimCardIcon,
  TruckIcon,
} from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { CarrierLogo } from "@/components/site/carrier-logo"
import { FaqList } from "@/components/site/faq-list"
import { PlanCard } from "@/components/site/plan-card"
import { PlanConfigurator } from "@/components/site/plan-configurator"
import { ProductBadge } from "@/components/site/product-mark"
import { Container } from "@/components/site/section"
import { getActiveCarriers, getIntlCallingAddon, getPublishedPlans } from "@/lib/catalog"
import { faqs } from "@/lib/faq"
import { dataLabel, formatPrice, hotspotLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import heroPhoto from "@/public/images/statue-of-liberty-from-plane.jpg"
import esimPhoto from "@/public/images/phone-new-york-street.jpg"
import simPhoto from "@/public/images/sim-card-and-tray.jpg"
import arrivalPhoto from "@/public/images/traveller-call-airport.jpg"
import duskPhoto from "@/public/images/san-francisco-dusk.jpg"
import cabPhoto from "@/public/images/cab-new-york-avenue.jpg"
import hotspotPhoto from "@/public/images/phone-laptop-cafe-table.jpg"
import callPhoto from "@/public/images/call-at-desk.jpg"
import phonePhoto from "@/public/images/phone-in-hand.jpg"
import bridgePhoto from "@/public/images/brooklyn-bridge-walkway.jpg"
import beachPhoto from "@/public/images/miami-beach-path.jpg"
import roadPhoto from "@/public/images/mountain-road-drive.jpg"
import campusPhoto from "@/public/images/campus-walk.jpg"
import shopPhoto from "@/public/images/phone-shop-counter.jpg"

export const metadata: Metadata = {
  title: { absolute: "US SIM Cards and eSIMs for Travellers | MultiSims USA" },
  alternates: { canonical: "/" },
}

const trips: { title: string; length: string; photo: StaticImageData; alt: string; position: string }[] = [
  {
    title: "City break",
    length: "A long weekend to a week",
    photo: bridgePhoto,
    alt: "The Brooklyn Bridge walkway at sunrise with the Manhattan skyline ahead",
    position: "object-[50%_60%]",
  },
  {
    title: "Beach holiday",
    length: "One to two weeks",
    photo: beachPhoto,
    alt: "A sandy path through the dunes to a lifeguard hut on Miami Beach",
    position: "object-center",
  },
  {
    title: "Road trip",
    length: "Two weeks or more",
    photo: roadPhoto,
    alt: "A driver's view of an empty desert highway running toward the mountains",
    position: "object-[45%_50%]",
  },
  {
    title: "Study or long stay",
    length: "A month or two",
    photo: campusPhoto,
    alt: "Students walking along a path across a university campus lawn",
    position: "object-[40%_50%]",
  },
]

export default async function HomePage() {
  const [plans, carriers, addon] = await Promise.all([
    getPublishedPlans(),
    getActiveCarriers(),
    getIntlCallingAddon(),
  ])

  const carriersWithPlans = carriers.filter((c) => plans.some((p) => p.carrier.id === c.id))
  const featured =
    plans.find((p) => p.product_type === "esim" && p.data_gb === null) ?? plans[0] ?? null
  const esimCount = plans.filter((p) => p.product_type === "esim").length
  const simCount = plans.filter((p) => p.product_type === "physical").length
  const showcase = pickShowcase(plans)
  const carrierNames = carriersWithPlans.slice(0, 3).map((c) => c.name)
  const lengths = [...new Set(plans.flatMap((p) => p.packages.map((pkg) => pkg.days)))].sort((a, b) => a - b)

  return (
    <>
      {/* Hero. Phones: offer, then the photo with the plan picker overlapping it.
          Desktop: one photo stage, offer in white over the dark window frame, picker on the right. */}
      <section className="relative">
        <Container className="relative pt-8 pb-16 sm:pt-10 lg:pt-6 lg:pb-20">
          <div className="lg:relative lg:isolate lg:flex lg:min-h-[41rem] lg:items-center lg:overflow-hidden lg:rounded-xl">
            <div className="max-w-xl lg:p-14 lg:pr-0">
              <h1 className="text-[2.6rem] leading-[1.05] font-semibold sm:text-6xl lg:text-white">
                US SIM cards and eSIMs, ready before you land.
              </h1>
              <p className="mt-5 max-w-[44ch] text-lg text-muted-foreground lg:text-white/80">
                {carrierNames.length
                  ? `Lines on ${carrierNames.join(", ")} and more. `
                  : "Lines on the major US networks. "}
                Pick your days, pay, and get connected.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/plans"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 px-6 text-base lg:bg-white lg:text-[oklch(0.25_0.097_324)] lg:hover:bg-white/90"
                  )}
                >
                  Browse plans
                  <ArrowRightIcon weight="bold" data-icon="inline-end" />
                </Link>
                <Link
                  href="#products"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 px-6 text-base lg:border-white/35 lg:bg-transparent lg:text-white lg:hover:bg-white/10 lg:dark:bg-transparent"
                  )}
                >
                  eSIM or SIM card?
                </Link>
              </div>
            </div>

            <figure className="relative mt-10 aspect-[5/4] overflow-hidden rounded-xl bg-muted sm:aspect-[16/10] lg:absolute lg:inset-0 lg:-z-10 lg:mt-0 lg:aspect-auto lg:rounded-none">
              <Image
                src={heroPhoto}
                alt="The Statue of Liberty and the New York skyline seen from an aircraft window"
                fill
                preload
                placeholder="blur"
                sizes="(min-width: 1152px) 1104px, 100vw"
                className="object-cover object-[50%_45%] lg:object-[50%_40%]"
              />
              <div
                aria-hidden
                className="absolute inset-0 hidden bg-[linear-gradient(90deg,oklch(0.15_0.04_324/0.88)_0%,oklch(0.15_0.04_324/0.6)_38%,oklch(0.15_0.04_324/0)_62%)] lg:block"
              />
              <figcaption className="absolute top-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm lg:top-5 lg:right-5">
                Liberty Island, New York
              </figcaption>
            </figure>
          </div>

          {featured ? (
            <div className="relative mx-3 -mt-12 rounded-xl border bg-card p-5 shadow-pop sm:mx-auto sm:-mt-20 sm:max-w-md sm:p-6 lg:absolute lg:right-10 lg:bottom-[6.5rem] lg:mx-0 lg:mt-0 lg:w-[21rem] lg:max-w-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CarrierLogo carrier={featured.carrier} size="sm" />
                  <p className="mt-2 font-heading text-xl font-semibold tracking-[-0.02em]">
                    <Link
                      href={`/plans/${featured.slug}`}
                      className="-my-2.5 inline-flex min-h-11 items-center hover:underline underline-offset-4"
                    >
                      {featured.name}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {dataLabel(featured)}, {lowerFirst(hotspotLabel(featured))}
                  </p>
                </div>
                <ProductBadge type={featured.product_type} />
              </div>
              <PlanConfigurator plan={featured} addon={addon} variant="compact" className="mt-5" />
            </div>
          ) : null}
        </Container>
      </section>

      {/* Carrier strip, driven by the carriers table. */}
      {carriersWithPlans.length ? (
        <section aria-labelledby="partners" className="border-y bg-canvas">
          <Container className="flex flex-col items-center gap-6 py-8 sm:py-10 lg:flex-row lg:gap-12">
            <h2
              id="partners"
              className="shrink-0 font-sans text-sm font-medium tracking-normal text-muted-foreground"
            >
              Trusted network partners
            </h2>
            <ul className="flex flex-1 flex-wrap items-center justify-center gap-x-10 gap-y-5 sm:gap-x-12 lg:justify-between">
              {carriersWithPlans.map((carrier) => (
                <li key={carrier.id}>
                  <Link
                    href={`/plans?carrier=${carrier.slug}`}
                    className="group inline-flex min-h-11 items-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                  >
                    <CarrierLogo
                      carrier={carrier}
                      tone="mono"
                      className="transition-[filter,opacity] duration-200 group-hover:opacity-100 group-hover:brightness-100 group-focus-visible:opacity-100 group-focus-visible:brightness-100 dark:group-hover:brightness-0 dark:group-focus-visible:brightness-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* What the line does for a visitor. */}
      <section aria-labelledby="benefits">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 id="benefits" className="max-w-md text-3xl font-semibold sm:text-4xl">
              A real US line, not just data
            </h2>
            <p className="max-w-[46ch] text-lg text-muted-foreground lg:justify-self-end">
              Every plan comes on a US carrier, with talk and text alongside the data, so your phone
              works the way it does at home.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-6">
            <BenefitPhoto
              className="lg:col-span-4"
              photo={cabPhoto}
              alt="A traveller hailing a yellow cab on a New York avenue"
              position="object-[30%_60%]"
              aspect="aspect-[16/9] lg:aspect-auto lg:h-72"
              title="A US number of your own"
              body="Call and text US numbers, receive sign-in codes, and use ride and delivery apps that ask for a US number."
            />
            <BenefitPhoto
              className="lg:col-span-2"
              photo={hotspotPhoto}
              alt="An espresso, a phone and a laptop on a cafe table"
              position="object-[50%_40%]"
              aspect="aspect-[16/9] lg:aspect-auto lg:h-72"
              title="Share it with your laptop"
              body="Each plan lists its hotspot allowance, so you know before you buy."
            />
            <div className="flex flex-col justify-between gap-8 rounded-xl bg-brand-soft p-7 sm:p-8 lg:col-span-2">
              <div>
                <h3 className="text-xl font-semibold">Pay for the days you stay</h3>
                <p className="mt-2 text-foreground/75">
                  Plans are sold by the day, not by the month. Pick the length that matches your trip.
                </p>
              </div>
              {lengths.length ? (
                <ul aria-label="Package lengths on sale" className="flex flex-wrap gap-2">
                  {lengths.slice(0, 8).map((days) => (
                    <li
                      key={days}
                      className="sim-cut rounded-md bg-background px-3 py-2 font-mono text-sm tabular-nums [--sim-cut:8px]"
                    >
                      {days} {days === 1 ? "day" : "days"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {addon ? (
              <BenefitPhoto
                className="lg:col-span-4"
                photo={callPhoto}
                alt="A woman smiling during a phone call at her desk"
                position="object-[60%_35%]"
                aspect="aspect-[16/9] lg:aspect-auto lg:h-72"
                title="Call home too"
                body={`Add international calling to any plan for ${formatPrice(addon.price_cents)} and call numbers outside the US from your US line.`}
              />
            ) : null}
          </div>
        </Container>
      </section>

      {/* Two separate products. */}
      <section id="products" className="scroll-mt-20 border-t bg-canvas">
        <Container className="py-20 sm:py-28">
          <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">Two ways to get a US number</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <ProductPanel
              tone="brand"
              photo={esimPhoto}
              photoAlt="A traveller holding up a phone to photograph a New York street lined with yellow taxis"
              photoPosition="object-[50%_44%]"
              icon={<QrCodeIcon weight="bold" className="size-6" />}
              title="eSIM"
              body="Delivered as a QR code by email and on your order page. Scan it and your phone joins the network, no plastic card needed."
              points={[
                { icon: <EnvelopeSimpleIcon className="size-4" />, text: "QR code sent to your inbox" },
                { icon: <CellTowerIcon className="size-4" />, text: "Needs an eSIM-capable, unlocked phone" },
              ]}
              href="/plans?type=esim"
              cta={`See ${plural(esimCount, "eSIM plan", "eSIM plans")}`}
            />
            <ProductPanel
              tone="muted"
              photo={simPhoto}
              photoAlt="A nano SIM card beside an open SIM tray and a phone"
              photoPosition="object-center"
              icon={<SimCardIcon weight="bold" className="size-6" />}
              title="SIM card"
              body="A physical SIM card for any unlocked phone, posted from the US by USPS."
              points={[
                { icon: <TruckIcon className="size-4" />, text: "Tracking number on your order page" },
                { icon: <CellTowerIcon className="size-4" />, text: "Works in phones without eSIM" },
              ]}
              href="/plans?type=physical"
              cta={`See ${plural(simCount, "SIM card plan", "SIM card plans")}`}
            />
          </div>
        </Container>
      </section>

      {/* Phone readiness check. */}
      <section aria-labelledby="phone-check" className="border-t">
        <Container className="grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-[0.85fr_1fr] lg:gap-16">
          <figure className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted lg:aspect-[4/5]">
            <Image
              src={phonePhoto}
              alt="A hand holding a smartphone showing its home screen"
              fill
              placeholder="blur"
              sizes="(min-width: 1152px) 460px, (min-width: 1024px) 40vw, 100vw"
              className="object-cover object-[55%_50%] dark:brightness-90"
            />
          </figure>
          <div>
            <h2 id="phone-check" className="max-w-md text-3xl font-semibold sm:text-4xl">
              Will my phone work?
            </h2>
            <p className="mt-4 max-w-[52ch] text-lg text-muted-foreground">
              Two things matter: your phone must be unlocked, and for an eSIM it must support eSIM. A
              one-minute check before you buy:
            </p>

            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
              <CheckPanel
                icon={<AppleLogoIcon weight="fill" className="size-5" />}
                title="iPhone"
                steps={[
                  "Settings > General > About. Carrier Lock should read No SIM restrictions.",
                  "In the same screen, a Digital SIM or EID entry means eSIM works.",
                ]}
              />
              <CheckPanel
                icon={<AndroidLogoIcon weight="fill" className="size-5" />}
                title="Android"
                steps={[
                  "Samsung: Settings > Connections > SIM manager. Pixel: Settings > Network & internet > SIMs. An option to add an eSIM means eSIM works.",
                  "Ask the carrier that sold you the phone whether it is unlocked.",
                ]}
              />
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              On any phone, dial <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">*#06#</kbd>.
              If an EID number appears, the phone supports eSIM.
            </p>
            <Link
              href="/plans?type=physical"
              className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline underline-offset-4"
            >
              No eSIM? Choose a SIM card instead
              <ArrowRightIcon weight="bold" className="size-4" />
            </Link>
          </div>
        </Container>
      </section>

      {/* A slice of the catalogue. */}
      {showcase.length ? (
        <section className="border-t bg-canvas">
          <Container className="py-20 sm:py-28">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="max-w-xl text-3xl font-semibold sm:text-4xl">Plans on every major network</h2>
              <Link
                href="/plans"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
              >
                All {plural(plans.length, "plan", "plans")}
                <ArrowRightIcon weight="bold" className="size-4" />
              </Link>
            </div>
            {/* Phones swipe through the plans; wider screens get the grid. */}
            <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
              {showcase.map((plan) => (
                <li key={plan.id} className="w-[84%] shrink-0 snap-start sm:w-auto [&>*]:h-full">
                  <PlanCard plan={plan} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* Trip lengths, shown as trips. */}
      <section aria-labelledby="trips" className="border-t">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 id="trips" className="max-w-md text-3xl font-semibold sm:text-4xl">
              Match the days to your trip
            </h2>
            {lengths.length > 1 ? (
              <p className="max-w-[46ch] text-lg text-muted-foreground lg:justify-self-end">
                Packages run from {formatLength(lengths[0])} to {formatLength(lengths[lengths.length - 1])}.
                Buy the length of your stay and nothing more.
              </p>
            ) : null}
          </div>
          <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {trips.map((trip) => (
              <li key={trip.title}>
                <Link
                  href="/plans"
                  className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Image
                    src={trip.photo}
                    alt={trip.alt}
                    fill
                    placeholder="blur"
                    sizes="(min-width: 1152px) 264px, (min-width: 1024px) 23vw, 50vw"
                    className={cn(
                      "object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none",
                      trip.position
                    )}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,oklch(0.15_0.04_324/0.85)_100%)]"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                    <h3 className="text-lg font-semibold text-white sm:text-xl">{trip.title}</h3>
                    <p className="mt-0.5 text-sm text-white/80">{trip.length}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* How it works, beside the moment it leads to. */}
      <section className="border-t">
        <Container className="grid items-center gap-10 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="max-w-sm text-3xl font-semibold sm:text-4xl">From checkout to signal</h2>
            <figure className="relative mt-8 aspect-[3/2] overflow-hidden rounded-xl bg-muted">
              <Image
                src={arrivalPhoto}
                alt="A smiling traveller on a phone call beside the departures board in an airport terminal"
                fill
                placeholder="blur"
                sizes="(min-width: 1152px) 540px, (min-width: 1024px) 46vw, 100vw"
                className="object-cover object-[70%_50%] dark:brightness-90"
              />
            </figure>
          </div>
          <ol className="divide-y border-y">
            {[
              {
                title: "Choose",
                body: "Pick eSIM or SIM card, a carrier plan, and how many days you need.",
              },
              {
                title: "Pay",
                body: "Pay in USDT or Bitcoin. Add international calling if you need it.",
              },
              {
                title: "Connect",
                body: "Scan your eSIM QR code, or insert the SIM card when it arrives.",
              },
            ].map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-7 sm:py-8">
                <span aria-hidden className="pt-1 font-mono text-sm text-copper-ink tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="mt-1.5 max-w-[46ch] text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Dealers and wholesalers. */}
      <section aria-labelledby="dealers" className="border-t bg-canvas">
        <Container className="grid items-center gap-10 py-20 sm:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="lg:order-2">
            <figure className="relative aspect-[3/2] overflow-hidden rounded-xl bg-muted">
              <Image
                src={shopPhoto}
                alt="A boxed phone handed across a shop counter full of phone accessories"
                fill
                placeholder="blur"
                sizes="(min-width: 1152px) 560px, (min-width: 1024px) 50vw, 100vw"
                className="origin-top-left scale-105 object-cover object-[50%_40%] dark:brightness-90"
              />
            </figure>
          </div>
          <div className="lg:order-1">
            <h2 id="dealers" className="max-w-md text-3xl font-semibold sm:text-4xl">
              Selling US lines to your own customers?
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-muted-foreground">
              Dealers and wholesalers buy in bulk at wholesale prices through our dealer portal, with
              eSIM and SIM card orders in one place.
            </p>
            <ul className="mt-6 space-y-2.5">
              {["Wholesale prices on every plan", "Bulk orders, mixed carriers", "Order history for every line"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2.5 text-foreground/85">
                    <CheckIcon weight="bold" aria-hidden className="size-4 text-brand" />
                    {item}
                  </li>
                )
              )}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:items-start">
              <Link href="/contact" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
                Ask about a dealer account
                <ArrowRightIcon weight="bold" data-icon="inline-end" />
              </Link>
              <p className="text-sm text-muted-foreground">Dealer accounts are set up by our team.</p>
            </div>
          </div>
        </Container>
      </section>

      {/* FAQ teaser. */}
      <section className="border-t">
        <Container className="grid gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="max-w-sm text-3xl font-semibold sm:text-4xl">Questions before you buy</h2>
            <Link
              href="/faq"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
            >
              Read the full FAQ
              <ArrowRightIcon weight="bold" className="size-4" />
            </Link>
          </div>
          <FaqList items={faqs.slice(0, 4)} />
        </Container>
      </section>

      {/* Closing band: one decision, over a US city at dusk. */}
      <section aria-labelledby="close" className="relative isolate overflow-hidden">
        <Image
          src={duskPhoto}
          alt=""
          fill
          placeholder="blur"
          sizes="100vw"
          className="-z-20 object-cover object-[60%_55%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[oklch(0.17_0.05_324/0.66)] sm:bg-[linear-gradient(90deg,oklch(0.17_0.05_324/0.86)_0%,oklch(0.17_0.05_324/0.5)_50%,oklch(0.17_0.05_324/0)_100%)]"
        />
        <Container className="py-24 sm:py-32">
          <h2 id="close" className="max-w-lg text-4xl font-semibold text-white sm:text-5xl">
            Land with a working US number.
          </h2>
          <p className="mt-4 max-w-md text-lg text-white/80">
            Choose a carrier and the days you need. eSIM QR codes arrive by email; SIM cards travel by
            USPS with tracking.
          </p>
          <Link
            href="/plans"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-8 h-12 bg-white px-6 text-base text-[oklch(0.25_0.097_324)] hover:bg-white/90 dark:bg-white"
            )}
          >
            Browse plans
            <ArrowRightIcon weight="bold" data-icon="inline-end" />
          </Link>
        </Container>
      </section>
    </>
  )
}

function BenefitPhoto(props: {
  className?: string
  photo: StaticImageData
  alt: string
  position: string
  aspect: string
  title: string
  body: string
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", props.className)}>
      <div className={cn("relative", props.aspect)}>
        <Image
          src={props.photo}
          alt={props.alt}
          fill
          placeholder="blur"
          sizes="(min-width: 1152px) 720px, (min-width: 1024px) 64vw, 100vw"
          className={cn("object-cover dark:brightness-90", props.position)}
        />
      </div>
      <div className="flex-1 p-7 sm:p-8">
        <h3 className="text-xl font-semibold">{props.title}</h3>
        <p className="mt-2 max-w-[52ch] text-muted-foreground">{props.body}</p>
      </div>
    </div>
  )
}

function CheckPanel(props: { icon: React.ReactNode; title: string; steps: string[] }) {
  return (
    <div className="bg-card p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <span aria-hidden className="text-foreground/70">
          {props.icon}
        </span>
        {props.title}
      </h3>
      <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
        {props.steps.map((step, i) => (
          <li key={step} className="grid grid-cols-[1.25rem_1fr] gap-2">
            <span aria-hidden className="font-mono text-copper-ink tabular-nums">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ProductPanel(props: {
  tone: "brand" | "muted"
  photo: StaticImageData
  photoAlt: string
  photoPosition: string
  icon: React.ReactNode
  title: string
  body: string
  points: { icon: React.ReactNode; text: string }[]
  href: string
  cta: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl",
        props.tone === "brand" ? "bg-brand-soft" : "bg-muted"
      )}
    >
      <div className="relative aspect-[16/10]">
        <Image
          src={props.photo}
          alt={props.photoAlt}
          fill
          placeholder="blur"
          sizes="(min-width: 1152px) 620px, (min-width: 1024px) 54vw, 100vw"
          className={cn("object-cover dark:brightness-90", props.photoPosition)}
        />
      </div>
      <div className="relative flex flex-1 flex-col px-7 pb-7 sm:px-9 sm:pb-9">
        <span
          aria-hidden
          className={cn(
            "sim-cut -mt-6 inline-flex size-12 items-center justify-center rounded-md [--sim-cut:12px]",
            props.tone === "brand" ? "bg-brand text-brand-foreground" : "bg-copper text-white dark:text-[oklch(0.2_0.03_60)]"
          )}
        >
          {props.icon}
        </span>
        <h3 className="mt-5 text-2xl font-semibold">{props.title}</h3>
        <p className="mt-2 max-w-[44ch] text-foreground/75">{props.body}</p>
        <ul className="mt-6 space-y-2 text-sm">
          {props.points.map((p) => (
            <li key={p.text} className="flex items-center gap-2.5 text-foreground/80">
              <span aria-hidden className="text-foreground/60">
                {p.icon}
              </span>
              {p.text}
            </li>
          ))}
        </ul>
        <Link
          href={props.href}
          className="mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 pt-8 text-sm font-semibold hover:underline underline-offset-4"
        >
          {props.cta}
          <ArrowRightIcon weight="bold" className="size-4" />
        </Link>
      </div>
    </div>
  )
}

/** One plan per carrier, up to six, so the slice shows the range of networks. */
function pickShowcase<T extends { carrier: { id: string } }>(plans: T[]) {
  const seen = new Set<string>()
  const picks: T[] = []
  for (const plan of plans) {
    if (seen.has(plan.carrier.id)) continue
    seen.add(plan.carrier.id)
    picks.push(plan)
    if (picks.length === 6) break
  }
  return picks
}

function formatLength(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
