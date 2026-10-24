"use client"

import { LoginActiveSwitch, NewLoginButton, ResetPasswordButton as ResetLoginPassword } from "@/components/admin/login-controls"
import { createAgent, resetAgentPassword, setAgentActive } from "./actions"

export function NewAgentButton() {
  return (
    <NewLoginButton
      label="New agent"
      title="New agent login"
      description="They sign in at Portal Login with this email and password. We email them the link; send the password yourself."
      action={createAgent}
    />
  )
}

export function AgentActiveSwitch({ agentId, active, name }: { agentId: string; active: boolean; name: string }) {
  return <LoginActiveSwitch userId={agentId} active={active} name={name} action={setAgentActive} />
}

export function ResetPasswordButton({ agentId, name }: { agentId: string; name: string }) {
  return <ResetLoginPassword userId={agentId} name={name} action={resetAgentPassword} />
}
