import { useCallback, useEffect, useState } from 'react'
import { Loader2, Satellite as SatelliteIcon } from 'lucide-react'
import { api, type Analysis, type Satellite } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatDateShort } from '@/lib/format'
import { cn } from '@/lib/utils'

const num = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const LEVEL: Record<Satellite['level'], { label: string; variant: 'error' | 'warning' | 'success' | 'secondary' | 'outline' }> = {
  niższa: { label: 'wyraźnie niższa niż zwykle', variant: 'error' },
  'nieco niższa': { label: 'nieco niższa niż zwykle', variant: 'warning' },
  typowa: { label: 'typowa', variant: 'success' },
  wyższa: { label: 'wyższa niż zwykle', variant: 'success' },
  niepewne: { label: 'niepewne', variant: 'secondary' },
  'brak danych': { label: 'brak danych', variant: 'outline' },
  'nie dotyczy': { label: 'poza sezonem uprawy', variant: 'outline' },
}

// NDMI of a crop canopy is roughly −0.3 … 0.7; bars are drawn on that scale
const BAR_MIN = -0.3
const BAR_MAX = 0.7
const barWidth = (v: number) => `${Math.max(2, Math.min(100, ((v - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100))}%`

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-bold tabular-nums">{value}</span>
    </div>
  )
}

/** Sentinel-2 check of the assessment. Loads on its own after the report (cold reads of the imagery take 10–25 s). */
export function SatelliteCard({ a }: { a: Analysis }) {
  const [data, setData] = useState<Satellite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api
      .satellite(a.parcel.id, a.crop.id, a.analysis_date)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [a.parcel.id, a.crop.id, a.analysis_date])

  useEffect(() => load(), [load])

  const cur = data?.current
  const lvl = data ? LEVEL[data.level] : null
  const years = data ? [...data.baseline].sort((x, y) => x.date.localeCompare(y.date)) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <SatelliteIcon className="text-muted-foreground size-5" aria-hidden />
          Zdjęcie satelitarne (Sentinel-2)
          {lvl && <Badge variant={lvl.variant}>wilgotność roślin: {lvl.label}</Badge>}
        </CardTitle>
        <CardDescription>Potwierdzenie oceny: wilgotność (NDMI) i zieleń roślin (NDVI) na działce na tle tej samej pory roku w poprzednich latach.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Pobieram zdjęcia satelitarne działki z ostatnich lat… Za pierwszym razem trwa to do ok. 30 sekund.
          </p>
        )}
        {error && !loading && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Spróbuj ponownie
            </Button>
          </div>
        )}
        {data && !loading && (
          <>
            <p>{data.assessment}</p>
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <Row
                  label="Zdjęcie z dnia"
                  value={cur ? `${formatDate(cur.date)} · działka bez chmur ${Math.round(cur.clear_share * 100)}%` : 'brak bezchmurnego zdjęcia'}
                />
                <Row label="Faza uprawy w tym terminie" value={data.stage} />
              </div>
              <div>
                <Row label="Wilgotność roślin NDMI (teraz / zwykle)" value={`${num(cur?.ndmi)} / ${num(data.ndmi_median)}`} />
                <Row label="Zieleń roślin NDVI (teraz / zwykle)" value={`${num(cur?.ndvi)} / ${num(data.ndvi_median)}`} />
              </div>
            </div>

            {years.length > 0 && (
              <div className="grid gap-1.5">
                <p className="type-label">NDMI w tym terminie, rok po roku</p>
                <ul className="grid gap-1.5 select-none">
                  {[...years, ...(cur ? [cur] : [])].map((s) => {
                    const isCur = s === cur
                    const bare = (s.ndvi ?? 0) < 0.4
                    return (
                      <li key={s.scene} className="grid grid-cols-[6rem_1fr_3.5rem] items-center gap-3 text-sm">
                        <span className={cn('tabular-nums', isCur && 'font-bold')}>{formatDateShort(s.date)} {s.date.slice(0, 4)}</span>
                        <span className="bg-muted h-2.5 overflow-hidden rounded-full">
                          <span
                            className={cn('block h-full rounded-full', isCur ? 'bg-primary' : bare ? 'bg-border' : 'bg-outline')}
                            style={{ width: barWidth(s.ndmi ?? BAR_MIN) }}
                          />
                        </span>
                        <span className={cn('text-right tabular-nums', bare && 'text-muted-foreground')}>{num(s.ndmi)}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-muted-foreground text-xs">
                  Jaśniejsze paski: lata, gdy pole było prawie bez zieleni (NDVI poniżej 0,4, np. po zbiorze) – nie liczą się do „zwykle”
                  {data.n_reference ? ` (porównanie z ${data.n_reference} latami)` : ''}.
                </p>
              </div>
            )}

            <div className="text-muted-foreground grid gap-1 text-xs">
              <p>
                Źródło: {data.source.name} · {data.source.license}
              </p>
              {data.limitations.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
