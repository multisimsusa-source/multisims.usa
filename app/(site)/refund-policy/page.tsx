import type { Metadata } from "next"

import { LegalPage } from "@/components/site/legal-page"
import { refundPolicy } from "@/lib/legal"

export const metadata: Metadata = {
  title: refundPolicy.title,
  description: refundPolicy.description,
  alternates: { canonical: "/refund-policy" },
}

export default function RefundPolicyPage() {
  return <LegalPage doc={refundPolicy} />
}
