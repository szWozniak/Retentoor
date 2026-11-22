import { useCallback, useEffect, useState } from 'react'
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ServiceState = { name: string; state: 'ok' | 'limit' | 'down' }
export type Group = { id: 'gugik' | 'weather'; state: 'ok' | 'limit' | 'down'; services: ServiceState[] }
export type Status = { ok: boolean; groups: Group[] } | { ok: false; offline: true }
type Message = { key: string; icon: typeof WifiOff; title: string; body: string }

const POLL_MS = 60_000 // the backend caches the check for 60 s, so polling never adds load on the data providers

export async function fetchStatus(fresh = false): Promise<Status> {
  try {
    const res = await fetch(`/api/health/sources${fresh ? '?fresh=true' : ''}`)
    if (!res.ok) return { ok: false, offline: true }
    return await res.json()
  } catch {
    return { ok: false, offline: true }
  }
}

function messages(status: Status): Message[] {
  if ('offline' in status)
    return [
      {
        key: 'offline',
        icon: WifiOff,
        title: 'Brak połączenia z serwerem Retentoor',
        body: 'Sprawdź połączenie z internetem. Analizy nie będą działać, dopóki połączenie nie wróci.',
      },
    ]
  const out: Message[] = []
  for (const g of status.groups) {
    if (g.state === 'ok') continue
    const limited = g.state === 'limit'
    const names = g.services.filter((s) => s.state !== 'ok').map((s) => s.name)
    if (g.id === 'gugik')
      out.push({
        key: g.id,
        icon: WifiOff,
        title: limited ? 'GUGiK chwilowo blokuje zapytania z tej sieci' : 'Usługi GUGiK nie odpowiadają',
        body:
          (limited ? 'Przekroczony został limit zapytań do usług GUGiK. ' : 'Serwery GUGiK są niedostępne. ') +
          `Nie działa: ${names.join(', ')}. Wcześniej sprawdzone działki i Moje pola działają normalnie. Nowe działki spróbuj za kilka minut` +
          (limited ? ' albo z innej sieci (np. hotspot w telefonie).' : '.'),
      })
    else
      out.push({
        key: g.id,
        icon: CloudOff,
        title: 'Brak połączenia z prognozą pogody',
        body:
          `Nie odpowiada żadne źródło prognozy (${names.join(', ')})` +
          (limited ? ' – przekroczony limit zapytań z tej sieci. ' : '. ') +
          'Analizy na dziś i daty wsteczne działają, ale bez prognozy opadów; analiza na przyszłą datę jest teraz niemożliwa.',
      })
  }
  return out
}

/** Full-width warnings under the header when the app server or live data services are unreachable. */
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
  const list = messages(status)
  if (!list.length) return null

  return (
    <div role="alert" className="no-print bg-error-container text-on-error-container border-error/30 border-b">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="grid min-w-0 flex-1 gap-3">
          {list.map(({ key, icon: Icon, title, body }) => (
            <div key={key} className="flex items-start gap-3">
              <Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-bold">{title}</p>
                <p className="text-sm">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={checking} className="border-current text-current">
          <RefreshCw className={checking ? 'animate-spin' : undefined} />
          Sprawdź ponownie
        </Button>
      </div>
    </div>
  )
}
