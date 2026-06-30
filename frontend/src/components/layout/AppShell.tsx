import { SideNav } from './SideNav.js'

interface Props {
  user: { name: string; email: string; avatarUrl: string | null }
  children: React.ReactNode
}

export function AppShell({ user, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <SideNav user={user} />
      <main className="flex-1 overflow-y-auto flex flex-col">{children}</main>
    </div>
  )
}
