import type { Metadata } from "next"

import { PortalShell } from "@/components/staff/portal-shell"
import { requireRole } from "@/lib/auth"

export const metadata: Metadata = {
  title: {
    default: "Dealer portal",
    template: "%s | Dealer portal | MultiSims USA",
  },
  robots: { index: false, follow: false },
}

export default function DealerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PortalShell variant="dealer" gate={DealerGate}>
      {children}
    </PortalShell>
  )
}

async function DealerGate({ children }: { children: React.ReactNode }) {
  await requireRole("dealer")
  return children
}
