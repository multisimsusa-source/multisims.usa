/** Portal page header: title, one line of plain explanation, the page's main action. */
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
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight text-balance sm:text-[2rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-[70ch] text-base text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
