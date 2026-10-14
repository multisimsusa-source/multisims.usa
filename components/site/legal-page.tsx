import { Container, PageHeader } from "@/components/site/section"
import type { LegalDocument } from "@/lib/legal"

/** A plain reading page for the Terms and the Refund Policy. Text lives in lib/legal.ts. */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <>
      <PageHeader title={doc.title} description={doc.description} />
      <Container className="py-12 sm:py-16">
        <p className="text-sm text-muted-foreground">Last updated {doc.updated}</p>
        <div className="mt-8 flex max-w-[68ch] flex-col gap-10">
          {doc.sections.map((section) => (
            <section key={section.heading} aria-labelledby={slug(section.heading)}>
              <h2 id={slug(section.heading)} className="text-xl font-semibold">
                {section.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3 text-foreground/80">
                {section.body.map((part, i) =>
                  Array.isArray(part) ? (
                    <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-copper-ink">
                      {part.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i}>{part}</p>
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      </Container>
    </>
  )
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}
