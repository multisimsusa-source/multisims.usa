import { getSessionProfile } from "@/lib/auth"
import { readFilters, reportTables } from "@/lib/admin/report-tables"
import { loadReport, resolveRange } from "@/lib/admin/reports"
import { toCsv } from "@/lib/staff/customers"

/** One report table as CSV, with the same range and filters as the page. */
export async function GET(request: Request) {
  const profile = await getSessionProfile()
  if (profile?.role !== "admin") return new Response("Not allowed", { status: 403 })
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const range = resolveRange(params)
  const table = reportTables(await loadReport(range, readFilters(params))).find((t) => t.key === params.report)
  if (!table) return new Response("Unknown report", { status: 404 })
  const csv = toCsv([table.head, ...table.rows, ...(table.total ? [table.total] : [])])
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multisims-${table.key}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
