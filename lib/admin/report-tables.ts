import "server-only"

import { byAgent, byCarrier, byDealer, type ReportData, type ReportFilters } from "@/lib/admin/reports"

/** The report tables, as plain rows: the page renders them and the CSV export writes them. */
export type ReportTable = { key: "carriers" | "agents" | "dealers"; title: string; head: string[]; rows: (string | number)[][]; total?: (string | number)[]; money: number[] }

const usd = (cents: number) => (cents / 100).toFixed(2)

export function reportTables(data: ReportData): ReportTable[] {
  const carriers = byCarrier(data)
  const sum = (k: keyof (typeof carriers)[number]) => carriers.reduce((n, r) => n + (r[k] as number), 0)
  const dealers = byDealer(data)
  return [
    {
      key: "carriers",
      title: "By carrier",
      head: ["Carrier", "Orders", "SIMs ordered", "Sales (USD)", "SIMs delivered", "Tickets", "Replacements"],
      rows: carriers.map((r) => [r.carrier, r.orders, r.sims, usd(r.salesCents), r.delivered, r.tickets, r.replacements]),
      total: ["Total", sum("orders"), sum("sims"), usd(sum("salesCents")), sum("delivered"), sum("tickets"), sum("replacements")],
      money: [3],
    },
    {
      key: "agents",
      title: "Agents",
      head: ["Agent", "SIMs filled", "Holding now"],
      rows: byAgent(data).map((a) => [a.name, a.filled, a.holding]),
      money: [],
    },
    {
      key: "dealers",
      title: "Dealers",
      head: ["Dealer", "Orders", "SIMs ordered", "Ordered (USD)", "Taken (USD)", "Funds in (USD)"],
      rows: dealers.map((d) => [d.company, d.orders, d.sims, usd(d.orderedCents), usd(d.takenCents), usd(d.fundedCents)]),
      total: [
        "Total",
        dealers.reduce((n, d) => n + d.orders, 0),
        dealers.reduce((n, d) => n + d.sims, 0),
        usd(dealers.reduce((n, d) => n + d.orderedCents, 0)),
        usd(dealers.reduce((n, d) => n + d.takenCents, 0)),
        usd(dealers.reduce((n, d) => n + d.fundedCents, 0)),
      ],
      money: [3, 4, 5],
    },
  ]
}

/** Filters from the URL, ignoring anything malformed. */
export function readFilters(params: Record<string, string>): ReportFilters {
  const id = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined)
  return {
    carrier: id(params.carrier),
    dealer: id(params.dealer),
    agent: id(params.agent),
    channel: params.channel === "website" || params.channel === "dealer" ? params.channel : undefined,
  }
}
