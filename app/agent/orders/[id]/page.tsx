import type { Metadata } from "next"
import { Suspense } from "react"

import { FormSkeleton } from "@/components/admin/skeletons"
import { OrderWorkspace } from "@/components/staff/order-workspace"
import { requireStaff } from "@/lib/auth"

export const metadata: Metadata = { title: "Order" }

export default function AgentOrderPage({ params }: PageProps<"/agent/orders/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton sections={2} />}>
      <Workspace params={params} />
    </Suspense>
  )
}

async function Workspace({ params }: Pick<PageProps<"/agent/orders/[id]">, "params">) {
  const [{ id }, viewer] = await Promise.all([params, requireStaff()])
  return <OrderWorkspace id={id} viewer={viewer} />
}
