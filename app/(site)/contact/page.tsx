import type { Metadata } from "next"
import Link from "next/link"

import { Container, PageHeader } from "@/components/site/section"
import { ContactForm } from "./contact-form"

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Questions about a US SIM or eSIM, or an existing order? Send us a message.",
  alternates: { canonical: "/contact" },
}

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Contact us"
        description="Questions about a plan, or help with an order you have already placed. We reply by email."
      />
      <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div className="space-y-6 text-muted-foreground">
          <div>
            <h2 className="font-sans text-base font-medium tracking-normal text-foreground">Already ordered?</h2>
            <p className="mt-1.5">
              Include your order number so we can find it quickly. Your order page, linked in your
              confirmation email, always shows the latest status.
            </p>
          </div>
          <div>
            <h2 className="font-sans text-base font-medium tracking-normal text-foreground">Choosing a plan?</h2>
            <p className="mt-1.5">
              Many questions are answered in our{" "}
              <Link href="/faq" className="font-medium text-brand hover:underline underline-offset-4">
                FAQ
              </Link>
              .
            </p>
          </div>
        </div>
        <ContactForm />
      </Container>
    </>
  )
}
