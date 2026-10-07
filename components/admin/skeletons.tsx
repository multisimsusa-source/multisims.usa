import { Skeleton } from "@/components/ui/skeleton"

/** Loading shapes that match the admin content they stand in for, so nothing jumps. */

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="divide-y overflow-hidden rounded-xl border bg-background">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-14 rounded-full sm:block" />
          <Skeleton className="h-9 w-14" />
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="rounded-xl border bg-background p-4 sm:p-6">
          <Skeleton className="h-5 w-32" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <div aria-hidden>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 bg-background p-4 sm:p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-12 rounded-xl" />
      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[26rem] rounded-xl lg:col-span-3" />
        <Skeleton className="h-[26rem] rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl lg:col-span-5" />
      </div>
    </div>
  )
}
