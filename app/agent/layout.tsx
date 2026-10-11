import type { Metadata } from "next"

import { PortalShell } from "@/components/staff/portal-shell"
import { requireStaff } from "@/lib/auth"

export const metadata: Metadata = {
  title: { default: "Agent portal", template: "%s | Agent portal | MultiSims USA" },
  robots: { index: false, follow: false },
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell variant="agent" gate={StaffGate}>
      {children}
    </PortalShell>
  )
}

async function StaffGate({ children }: { children: React.ReactNode }) {
  await requireStaff()
  return children
}
