import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { Wordmark } from "@/components/site/wordmark"
import { signOut } from "@/app/portal/actions"
import { requireRole } from "@/lib/auth"

export const metadata: Metadata = { title: "Dealer portal", robots: { index: false, follow: false } }

export default function DealerPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6">
      <Wordmark />
      <Suspense fallback={<Skeleton className="mt-16 h-40 rounded-xl" />}>
        <DealerPlaceholder />
      </Suspense>
    </main>
  )
}

async function DealerPlaceholder() {
  const profile = await requireRole("dealer")
  return (
    <div className="mt-16 rounded-xl border bg-card p-6">
      <h1 className="text-2xl font-semibold">Dealer portal</h1>
      <p className="mt-2 text-muted-foreground">
        Signed in as {profile.email}. The dealer portal opens in an upcoming release.
      </p>
      <form action={signOut} className="mt-6">
        <button type="submit" className="text-sm font-medium text-brand hover:underline">
          Sign out
        </button>
      </form>
    </div>
  )
}
