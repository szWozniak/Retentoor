import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Droplets } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHealth } from '@/hooks/useHealth'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useSavedFields } from '@/lib/fields'

/** Farmer-facing navigation. Developer pages (/demo, /records, /upload) stay reachable by URL only. */
const links = [
  { to: '/', label: 'Analiza działki' },
  { to: '/pola', label: 'Moje pola' },
]

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

export default function Layout() {
  usePrintLightTheme()
  const { data, error } = useHealth(15000)
  const { fields } = useSavedFields()
  const up = !!data && !error

  return (
    <div className="bg-muted/30 flex min-h-screen flex-col">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Przejdź do treści
      </a>
      <header className="no-print bg-background border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Zatrzymaj Wodę – strona główna">
            <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg shadow-sm">
              <Droplets className="size-5" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">Zatrzymaj Wodę</span>
              <span className="text-muted-foreground block text-xs">asystent retencji dla rolnika</span>
            </span>
          </Link>
          <nav className="flex gap-1" aria-label="Główna nawigacja">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {l.label}
                {l.to === '/pola' && fields.length > 0 && (
                  <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums">{fields.length}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NavLink
              to="/status"
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1 text-xs"
              title="Stan usług"
            >
              <span className={cn('size-2 rounded-full', up ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
              <span className="hidden sm:inline">{up ? 'Usługi działają' : 'Brak połączenia z serwerem'}</span>
            </NavLink>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 content-start gap-6 px-4 py-6">
        <Outlet />
      </main>

      <footer className="no-print text-muted-foreground border-t text-xs">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl">
            Prototyp przygotowany na HackNation 2026 (zadanie KOWR „Zatrzymaj wodę, chroń plony”). Rekomendacje mają charakter
            informacyjny i nie zastępują porady doradcy rolnego ani decyzji administracyjnych.
          </p>
          <p className="sm:text-right">
            Dane: GUGiK (ULDK, NMT, ortofotomapa), IUNG-PIB, Open-Meteo / NASA POWER, ISRIC SoilGrids.
            <br />
            Metodyka: IUNG-PIB SMSR, FAO-56.
          </p>
        </div>
      </footer>
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  )
}
