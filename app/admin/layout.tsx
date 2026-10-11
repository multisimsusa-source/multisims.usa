import type { Metadata } from "next"

import { PortalShell } from "@/components/staff/portal-shell"
import { requireRole } from "@/lib/auth"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | MultiSims USA" },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell variant="admin" gate={AdminGate}>
      {children}
    </PortalShell>
  )
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireRole("admin")
  return children
}
