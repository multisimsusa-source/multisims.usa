import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "@phosphor-icons/react/ssr"

import { buttonVariants } from "@/components/ui/button"
import { Container, PageHeader } from "@/components/site/section"
import { cn } from "@/lib/utils"
import roadPhoto from "@/public/images/desert-road-red-rock.jpg"

export const metadata: Metadata = {
  title: "About Us",
  description:
    "MultiSims USA sells US SIM cards and eSIMs on the major American networks to travellers and to dealers around the world.",
  alternates: { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="US lines, sold by people who have done it for years"
        description="MultiSims USA sells SIM cards and eSIMs on the major American networks, to travellers and to dealers around the world."
      />
      <Container className="pt-10 sm:pt-12">
        <figure className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted sm:aspect-[21/9]">
          <Image
            src={roadPhoto}
            alt="An open highway running toward a red rock mesa in the American Southwest"
            fill
            preload
            placeholder="blur"
            sizes="(min-width: 1152px) 1104px, 100vw"
            className="object-cover object-[50%_62%] dark:brightness-90"
          />
        </figure>
      </Container>
      <Container className="grid gap-14 py-16 sm:py-20 lg:grid-cols-[1fr_1fr]">
        <div className="max-w-[60ch] space-y-5 text-lg text-foreground/80">
          <p>
            We have been selling US SIM cards for around fifteen years. Over that time carriers have
            come and gone, and eSIMs have replaced a lot of plastic, but what visitors need has stayed
            the same: a working American number, on a network they trust, without fuss.
          </p>
          <p>
            We sell lines from the big US carriers and from the smaller networks that run on their
            towers. Every plan is sold by the day, so you pay for the length of your stay and nothing
            more.
          </p>
        </div>
        <dl className="grid content-start gap-px overflow-hidden rounded-xl border bg-border">
          {[
            {
              term: "For travellers",
              detail: "Buy one or two lines on this website, with no account. Choose eSIM or a SIM card posted from the US.",
            },
            {
              term: "For dealers",
              detail: "Wholesalers buy in bulk at wholesale prices through our dealer portal. Dealer accounts are set up by our team.",
            },
            {
              term: "US only",
              detail: "We only sell lines for the United States, so every plan here is one we know well.",
            },
          ].map((item) => (
            <div key={item.term} className="bg-card p-6">
              <dt className="font-heading text-lg font-semibold tracking-[-0.02em]">{item.term}</dt>
              <dd className="mt-1.5 text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </Container>
      <div className="border-t bg-canvas">
        <Container className="flex flex-col items-start justify-between gap-6 py-14 sm:flex-row sm:items-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Find the right US line for your trip</h2>
          <Link href="/plans" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
            Browse plans
            <ArrowRightIcon weight="bold" data-icon="inline-end" />
          </Link>
        </Container>
      </div>
    </>
  )
}
