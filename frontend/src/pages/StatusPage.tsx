import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useHealth } from '@/hooks/useHealth'

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  )
}

export default function StatusPage() {
  const { data, error, latencyMs, checkedAt, loading, refresh } = useHealth(5000)

  const apiUp = !!data && !error
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Status systemu
          <Badge variant={apiUp ? (data.status === 'ok' ? 'default' : 'secondary') : 'destructive'}>
            {loading ? 'sprawdzam…' : apiUp ? data.status : 'offline'}
          </Badge>
        </CardTitle>
        <CardDescription>Health check backendu, odświeżany co 5 sekund</CardDescription>
      </CardHeader>
      <CardContent>
        <Row label="API">{apiUp ? '✅ działa' : '❌ brak połączenia'}</Row>
        <Row label="Baza danych">{data ? (data.db === 'ok' ? '✅ ok' : '❌ błąd') : '-'}</Row>
        <Row label="Czas odpowiedzi">{latencyMs !== null ? `${latencyMs} ms` : '-'}</Row>
        <Row label="Uptime backendu">{data ? formatUptime(data.uptime_s) : '-'}</Row>
        <Row label="Ostatnie sprawdzenie">{checkedAt?.toLocaleTimeString('pl-PL') ?? '-'}</Row>
        {error && <p className="text-destructive mt-3 text-sm break-all">{error}</p>}
        <Button variant="outline" className="mt-4 w-full" onClick={refresh}>
          Sprawdź teraz
        </Button>
      </CardContent>
    </Card>
  )
}
