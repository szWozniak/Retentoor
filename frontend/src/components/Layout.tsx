import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useHealth } from '@/hooks/useHealth'

const links = [
  { to: '/', label: 'Rekordy' },
  { to: '/upload', label: 'Upload' },
  { to: '/status', label: 'Status' },
]

export default function Layout() {
  const { data, error } = useHealth(15000)
  const up = !!data && !error

  return (
    <div className="bg-muted/40 min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <h1 className="text-lg font-bold">HackNation 2026</h1>
          <nav className="flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/status" className="ml-auto flex items-center gap-2 text-sm">
            <span className={cn('size-2.5 rounded-full', up ? 'bg-emerald-500' : 'bg-red-500')} />
            API {up ? 'online' : 'offline'}
          </NavLink>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
