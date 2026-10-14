import type { Metadata } from "next"

import { LegalPage } from "@/components/site/legal-page"
import { terms } from "@/lib/legal"

export const metadata: Metadata = {
  title: terms.title,
  description: terms.description,
  alternates: { canonical: "/terms" },
}

export default function TermsPage() {
  return <LegalPage doc={terms} />
}
