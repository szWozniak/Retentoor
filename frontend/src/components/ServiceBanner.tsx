import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ServiceState = { name: string; state: 'ok' | 'limit' | 'down' }
type Status = { ok: boolean; services: ServiceState[] } | { ok: false; offline: true }

const POLL_MS = 60_000 // the backend caches the check for 60 s, so polling never adds load on GUGiK

async function fetchStatus(fresh = false): Promise<Status> {
  try {
    const res = await fetch(`/api/health/sources${fresh ? '?fresh=true' : ''}`)
    if (!res.ok) return { ok: false, offline: true }
    return await res.json()
  } catch {
    return { ok: false, offline: true }
  }
}

/** Full-width warning under the header when the app server or live GUGiK services are unreachable. */
export function ServiceBanner() {
  const [status, setStatus] = useState<Status | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async (fresh = false) => {
    setChecking(true)
    setStatus(await fetchStatus(fresh))
    setChecking(false)
  }, [])

  useEffect(() => {
    const tick = () => refresh()
    tick()
    const id = window.setInterval(tick, POLL_MS)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [refresh])

  if (!status || status.ok) return null

  let title: string
  let body: string
  if ('offline' in status) {
    title = 'Brak połączenia z serwerem Retentoor'
    body = 'Sprawdź połączenie z internetem. Analizy nie będą działać, dopóki połączenie nie wróci.'
  } else {
    const bad = status.services.filter((s) => s.state !== 'ok')
    const limited = bad.some((s) => s.state === 'limit')
    title = limited ? 'GUGiK chwilowo blokuje zapytania z tej sieci' : 'Usługi GUGiK nie odpowiadają'
    body =
      (limited
        ? 'Przekroczony został limit zapytań do usług GUGiK. '
        : 'Serwery GUGiK są niedostępne. ') +
      `Nie działa: ${bad.map((s) => s.name).join(', ')}. ` +
      'Wcześniej sprawdzone działki i Moje pola działają normalnie. Nowe działki spróbuj za kilka minut' +
      (limited ? ' albo z innej sieci (np. hotspot w telefonie).' : '.')
  }

  return (
    <div role="alert" className="no-print bg-error-container text-on-error-container border-b border-error/30">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <WifiOff className="size-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          <p className="text-sm">{body}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={checking} className="border-current text-current">
          <RefreshCw className={checking ? 'animate-spin' : undefined} />
          Sprawdź ponownie
        </Button>
      </div>
    </div>
  )
}
