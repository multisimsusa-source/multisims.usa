import type { Metadata } from "next"
import { Suspense } from "react"

import { FormSkeleton } from "@/components/admin/skeletons"
import { OrderWorkspace } from "@/components/staff/order-workspace"
import { requireRole } from "@/lib/auth"

export const metadata: Metadata = { title: "Order" }

export default function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton sections={2} />}>
      <Workspace params={params} />
    </Suspense>
  )
}

async function Workspace({ params }: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  const [{ id }, viewer] = await Promise.all([params, requireRole("admin")])
  return <OrderWorkspace id={id} viewer={viewer} />
}
