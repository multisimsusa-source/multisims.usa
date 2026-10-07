import { cn } from "@/lib/utils"

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="border-b bg-canvas">
      <Container className="py-12 sm:py-16">
        <h1 className="max-w-3xl text-4xl font-semibold sm:text-5xl">{title}</h1>
        {description ? (
          <p className="mt-4 max-w-[60ch] text-lg text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </Container>
    </div>
  )
}
