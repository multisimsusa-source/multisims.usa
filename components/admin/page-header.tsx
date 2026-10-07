export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[65ch] text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatusTag({ tone, children }: { tone: "live" | "hidden" | "neutral"; children: React.ReactNode }) {
  const tones = {
    live: "bg-success-soft text-success-ink",
    hidden: "bg-warning-soft text-warning-ink",
    neutral: "bg-muted text-muted-foreground",
  }
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium tracking-[0.04em] uppercase whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}
