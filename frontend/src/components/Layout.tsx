import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useHealth } from '@/hooks/useHealth'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useEffect } from 'react'

/** Reports always print in the light theme (white paper), regardless of the on-screen theme. */
function usePrintLightTheme() {
  useEffect(() => {
    let wasDark = false
    const before = () => {
      wasDark = document.documentElement.classList.contains('dark')
      document.documentElement.classList.remove('dark')
    }
    const after = () => {
      if (wasDark) document.documentElement.classList.add('dark')
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
}

const links = [
  { to: '/', label: 'Analiza działki' },
  { to: '/demo', label: 'Demo UI' },
  { to: '/records', label: 'Rekordy' },
  { to: '/upload', label: 'Upload' },
  { to: '/status', label: 'Status' },
]

export default function Layout() {
  usePrintLightTheme()
  const { data, error } = useHealth(15000)
  const up = !!data && !error

  return (
    <div className="bg-muted/40 min-h-screen">
      <header className="no-print bg-background border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
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
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/status" className="flex items-center gap-2 text-sm">
              <span className={cn('size-2.5 rounded-full', up ? 'bg-emerald-500' : 'bg-red-500')} />
              API {up ? 'online' : 'offline'}
            </NavLink>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        <Outlet />
      </main>
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  )
}
