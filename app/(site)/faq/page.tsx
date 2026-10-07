import type { Metadata } from "next"
import Link from "next/link"

import { FaqList } from "@/components/site/faq-list"
import { JsonLd } from "@/components/json-ld"
import { Container, PageHeader } from "@/components/site/section"
import { faqs } from "@/lib/faq"

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about US eSIMs and SIM cards: phone compatibility, delivery, checkout details, international calling and payment.",
  alternates: { canonical: "/faq" },
}

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
}

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PageHeader title="Frequently asked questions" />
      <Container className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_2fr]">
        <p className="max-w-xs text-muted-foreground">
          Cannot find your answer?{" "}
          <Link href="/contact" className="font-medium text-brand hover:underline underline-offset-4">
            Contact us
          </Link>
          .
        </p>
        <FaqList items={faqs} />
      </Container>
    </>
  )
}
