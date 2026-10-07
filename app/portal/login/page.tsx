import type { Metadata } from "next"
import { Suspense } from "react"

import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Portal Login",
  robots: { index: false, follow: false },
}

export default function LoginPage({ searchParams }: PageProps<"/portal/login">) {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-10 pb-20 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-semibold">Portal login</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            For the MultiSims USA team and registered dealers. Accounts are created by our team.
          </p>
          <div className="mt-8 rounded-xl border bg-card p-5 sm:p-6">
            <Suspense fallback={<LoginForm />}>
              <LoginWithNext searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  )
}

async function LoginWithNext({ searchParams }: Pick<PageProps<"/portal/login">, "searchParams">) {
  const { next } = await searchParams
  return <LoginForm next={typeof next === "string" ? next : undefined} />
}
