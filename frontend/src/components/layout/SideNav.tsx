import { NavLink } from 'react-router'
import { LayoutDashboard, Radio, CalendarDays, Settings, LogOut } from 'lucide-react'
import { api } from '../../lib/api.js'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'CAMPAIGNS' },
  { to: '/campaigns/new', icon: Radio, label: 'NEW CAMPAIGN' },
  { to: '/calendar', icon: CalendarDays, label: 'CALENDAR' },
]

interface Props { user: { name: string; email: string; avatarUrl: string | null } }

export function SideNav({ user }: Props) {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-charcoal-900 border-r border-charcoal-800">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-charcoal-800">
        <div className="w-8 h-8 bg-brand rounded-sm flex items-center justify-center">
          <span className="font-display font-bold text-sm text-white tracking-wider">BSF</span>
        </div>
        <div>
          <div className="font-display font-semibold text-sm tracking-wider text-white uppercase">Blue Sky Fable</div>
          <div className="font-mono text-xs text-charcoal-400">Content Studio</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-[120ms] ` +
              (isActive
                ? 'bg-charcoal-800 text-white'
                : 'text-charcoal-400 hover:text-white hover:bg-charcoal-800')
            }
          >
            <Icon size={16} />
            <span className="font-display uppercase tracking-wide">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-charcoal-800">
        <NavLink to="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded text-charcoal-400 hover:text-white hover:bg-charcoal-800 text-sm transition-colors duration-[120ms] mb-1">
          <Settings size={16} />
          <span className="font-display uppercase tracking-wide">Settings</span>
        </NavLink>
        <div className="flex items-center gap-3 px-3 py-2.5">
          {user.avatarUrl
            ? <img src={user.avatarUrl} className="w-7 h-7 rounded-full" alt="" />
            : <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center text-white text-xs font-bold">{initials}</div>
          }
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{user.name}</div>
            <div className="text-charcoal-400 text-xs truncate">{user.email}</div>
          </div>
          <button onClick={() => api.logout().then(() => window.location.href = '/').catch(() => window.location.href = '/')} className="text-charcoal-400 hover:text-white transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
