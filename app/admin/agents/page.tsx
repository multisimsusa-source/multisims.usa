import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminPageHeader } from "@/components/admin/page-header"
import { ListSkeleton } from "@/components/admin/skeletons"
import { Tag } from "@/components/patterns/tag"
import { createClient } from "@/lib/supabase/server"
import { AgentActiveSwitch, NewAgentButton, ResetPasswordButton } from "./agent-controls"

export const metadata: Metadata = { title: "Agents" }

export default function AgentsPage() {
  return (
    <>
      <AdminPageHeader
        title="Agents"
        description="Agents fill orders from the agent portal. Every active agent gets the new-order and ticket emails. Switching a login off sends their claimed orders back to the queue."
        actions={<NewAgentButton />}
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <AgentList />
      </Suspense>
    </>
  )
}

async function AgentList() {
  const supabase = await createClient()
  const [{ data: agents }, { data: counts }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, active, created_at").eq("role", "agent").order("active", { ascending: false }).order("full_name"),
    supabase.from("order_items").select("fulfilled_by").not("fulfilled_by", "is", null).in("status", ["fulfilled", "replaced"]).limit(100_000),
  ])
  const done = new Map<string, number>()
  for (const r of counts ?? []) done.set(r.fulfilled_by as string, (done.get(r.fulfilled_by as string) ?? 0) + 1)

  if (!agents?.length) {
    return (
      <div className="rounded-xl border bg-background p-8 text-center">
        <p className="font-medium">No agents yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Create a login for each person who fills orders. You can fill orders yourself from Agent queue meanwhile.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {agents.map((a) => {
        const name = a.full_name || a.email
        return (
          <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {name}
                {!a.active ? <Tag tone="neutral">Off</Tag> : null}
              </p>
              <p className="truncate text-sm text-muted-foreground">{a.email}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground tabular">{done.get(a.id) ?? 0}</span> SIMs filled
            </p>
            <div className="flex items-center gap-2">
              <ResetPasswordButton agentId={a.id} name={name} />
              <AgentActiveSwitch agentId={a.id} active={a.active} name={name} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
