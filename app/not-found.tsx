import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-start justify-center px-4 py-20">
      <title>Page not found | MultiSims USA</title>
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-4xl font-semibold">This page is not here</h1>
      <p className="mt-3 text-muted-foreground">
        The plan or page may have been removed. Our current plans are one click away.
      </p>
      <Link href="/plans" className={cn(buttonVariants({ size: "lg" }), "mt-8 h-11")}>
        Browse plans
      </Link>
    </main>
  )
}
