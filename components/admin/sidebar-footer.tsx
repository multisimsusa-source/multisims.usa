import { NavUser } from "@/components/admin/nav-user"
import { getSessionProfile } from "@/lib/auth"

export async function SidebarFooter() {
  const profile = await getSessionProfile()
  if (!profile) return null
  return <NavUser name={profile.full_name} email={profile.email} role={profile.role} />
}
