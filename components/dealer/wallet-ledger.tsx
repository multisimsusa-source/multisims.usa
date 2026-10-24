import { EmptyState } from "@/components/patterns/empty-state"
import { WalletIcon } from "@phosphor-icons/react/ssr"
import { Tag } from "@/components/patterns/tag"
import { ledgerKind, type LedgerEntry } from "@/lib/dealers"
import { formatPrice } from "@/lib/format"
import { formatDateTime, type Tone } from "@/lib/orders"
import { cn } from "@/lib/utils"

const effectTag: Record<
  (typeof ledgerKind)[keyof typeof ledgerKind]["effect"],
  { label: string; tone: Tone }
> = {
  in: { label: "In", tone: "success" },
  out: { label: "Out", tone: "neutral" },
  hold: { label: "Held", tone: "brand" },
  unhold: { label: "Returned", tone: "neutral" },
}

/**
 * Every wallet movement, newest first. Each row says in words which way the money moved
 * (In, Out, Held, Returned); colour only supports it.
 */
export function WalletLedger({
  entries,
  emptyText,
}: {
  entries: LedgerEntry[]
  emptyText: string
}) {
  if (!entries.length) return <EmptyState icon={<WalletIcon />}>{emptyText}</EmptyState>
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {entries.map((e) => {
        const kind = ledgerKind[e.kind]
        const tag = effectTag[kind.effect]
        return (
          <li key={e.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {kind.label}
                <Tag tone={tag.tone}>{tag.label}</Tag>
              </p>
              <p className="mt-0.5 text-sm break-words text-muted-foreground">
                {e.note ? `${e.note} · ` : ""}
                <span className="tabular">{formatDateTime(e.created_at)}</span>
              </p>
            </div>
            <p
              className={cn(
                "tabular shrink-0 pt-0.5 font-mono text-sm",
                kind.effect === "in" && "font-medium text-success-ink",
                (kind.effect === "hold" || kind.effect === "unhold") &&
                  "text-muted-foreground"
              )}
            >
              {kind.effect === "in" ? "+" : ""}
              {formatPrice(e.amount_cents)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
