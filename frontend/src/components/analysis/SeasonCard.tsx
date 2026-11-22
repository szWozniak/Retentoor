import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Loader2, Pause, Play, Satellite } from 'lucide-react'
import { api, type Analysis, type Season } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import { formatDate, formatDateShort } from '@/lib/format'
import { cn } from '@/lib/utils'

type Kind = 'rgb' | 'ndmi'
const FRAME_MS = 900
const num = (v: number | null) => (v === null ? '–' : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** same rule as the backend (sentinel.season_year): this year's season once April has come, otherwise last year's */
function seasonYear(iso: string) {
  const d = new Date(Math.min(new Date(iso).getTime(), Date.now()))
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
}

/**
 * "Sezon z satelity": every cloud-free Sentinel-2 image of the parcel from one growing season, played as a time-lapse
 * next to the greenness (NDVI) and plant-moisture (NDMI) curve. Loads only on request – the first read takes ~20–30 s.
 */
export function SeasonCard({ a }: { a: Analysis }) {
  const [season, setSeason] = useState<Season | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('rgb')
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})
  const timer = useRef<number | null>(null)
  const year = seasonYear(a.analysis_date)

  const src = useCallback(
    (scene: string, k: Kind) => `/api/analysis/satellite/image?scene=${encodeURIComponent(scene)}&parcel_id=${encodeURIComponent(a.parcel.id)}&kind=${k}`,
    [a.parcel.id],
  )

  const load = () => {
    setState('loading')
    setError(null)
    api
      .season(a.parcel.id, a.analysis_date)
      .then((s) => {
        setSeason(s)
        setI(0)
        setState('idle')
      })
      .catch((e: Error) => {
        setError(e.message)
        setState('error')
      })
  }

  // preload every frame of the chosen kind; play once they are in
  const frames = useMemo(() => season?.frames ?? [], [season])
  useEffect(() => {
    let alive = true
    for (const f of frames) {
      const key = `${f.scene}:${kind}`
      const img = new Image()
      img.onload = img.onerror = () => alive && setLoaded((l) => ({ ...l, [key]: true }))
      img.src = src(f.scene, kind)
    }
    return () => {
      alive = false
    }
  }, [frames, kind, src])
  const ready = frames.filter((f) => loaded[`${f.scene}:${kind}`]).length
  const allReady = frames.length > 0 && ready === frames.length

  // start playing by itself once, when the first set of frames is in (not again after the user paused)
  const autoStarted = useRef(false)
  useEffect(() => {
    if (allReady && !autoStarted.current) {
      autoStarted.current = true
      setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
  }, [allReady])

  useEffect(() => {
    if (!playing || frames.length < 2) return
    // hold the last frame a little longer before looping
    timer.current = window.setTimeout(() => setI((x) => (x + 1) % frames.length), i === frames.length - 1 ? FRAME_MS * 2.5 : FRAME_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [playing, i, frames.length])

  const f = frames[i]
  const data = frames.map((x) => ({ t: new Date(x.date).getTime(), date: x.date, ndvi: x.ndvi, ndmi: x.ndmi }))
  const config = {
    ndvi: { label: 'Zieleń roślin (NDVI)', color: 'var(--primary)' },
    ndmi: { label: 'Wilgotność roślin (NDMI)', color: '#0ea5e9' },
  }

  return (
    <Card className={season ? undefined : 'no-print'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Satellite className="text-muted-foreground size-5" aria-hidden /> Sezon {season?.year ?? year} z satelity
        </CardTitle>
        <CardDescription>Wszystkie bezchmurne zdjęcia działki od marca do października – jak pole zieleniało, schło i kiedy był zbiór.</CardDescription>
      </CardHeader>
      <CardContent>
        {!season && (
          <div className="bg-muted flex flex-col items-center justify-center gap-3 rounded-lg px-4 py-10 text-center">
            {state === 'loading' ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Szukam bezchmurnych zdjęć z całego sezonu… Za pierwszym razem do ok. 30 sekund.
              </p>
            ) : (
              <>
                {error && <p className="text-muted-foreground text-sm">{error}</p>}
                <Button onClick={load}>
                  <Play /> {error ? 'Spróbuj ponownie' : `Odtwórz sezon ${year}`}
                </Button>
              </>
            )}
          </div>
        )}

        {season && frames.length === 0 && <p className="text-muted-foreground text-sm">Brak bezchmurnych zdjęć tej działki z sezonu {season.year}.</p>}

        {season && f && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="grid gap-2">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
                {frames.map((x, j) => (
                  <img
                    key={`${x.scene}:${kind}`}
                    src={src(x.scene, kind)}
                    alt={j === i ? `Działka na zdjęciu satelitarnym z ${formatDate(x.date)}` : ''}
                    className={cn('absolute inset-0 size-full object-cover transition-opacity duration-300', j === i ? 'opacity-100' : 'opacity-0')}
                    style={{ imageRendering: kind === 'ndmi' ? 'pixelated' : 'auto' }}
                  />
                ))}
                <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-white tabular-nums">
                  {formatDate(f.date)}
                </span>
                {!allReady && (
                  <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> klatki {ready}/{frames.length}
                  </span>
                )}
              </div>
              <div className="flex gap-1" role="tablist" aria-label="Rodzaj obrazu">
                {(['rgb', 'ndmi'] as const).map((k) => (
                  <Button key={k} role="tab" aria-selected={kind === k} size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>
                    {k === 'rgb' ? 'Kolory naturalne' : 'Wilgotność (NDMI)'}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid content-start gap-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Klatka</p>
                  <p className="type-title-sm tabular-nums">
                    {i + 1} / {frames.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Zieleń NDVI</p>
                  <p className="type-title-sm text-primary tabular-nums">{num(f.ndvi)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Wilgotność NDMI</p>
                  <p className="type-title-sm tabular-nums" style={{ color: '#0ea5e9' }}>
                    {num(f.ndmi)}
                  </p>
                </div>
              </div>

              <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
                <ComposedChart
                  data={data}
                  margin={{ left: 4, right: 12, top: 8 }}
                  onClick={(e) => {
                    if (typeof e?.activeTooltipIndex === 'number') {
                      setPlaying(false)
                      setI(e.activeTooltipIndex)
                    }
                  }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                    tickFormatter={(v) => formatDateShort(v)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    domain={[-0.4, 1]}
                    ticks={[-0.2, 0, 0.2, 0.4, 0.6, 0.8]}
                    tickFormatter={(v: number) => v.toLocaleString('pl-PL')}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <ReferenceLine x={data[i]?.t} stroke="var(--foreground)" strokeOpacity={0.5} strokeDasharray="3 3" />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line dataKey="ndvi" stroke="var(--color-ndvi)" strokeWidth={2} dot={{ r: 2.5 }} activeDot={false} isAnimationActive={false} />
                  <Line dataKey="ndmi" stroke="var(--color-ndmi)" strokeWidth={2} dot={{ r: 2.5 }} activeDot={false} isAnimationActive={false} />
                </ComposedChart>
              </ChartContainer>

              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? 'Zatrzymaj' : 'Odtwórz'}
                  disabled={frames.length < 2}
                >
                  {playing ? <Pause /> : <Play />}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  value={i}
                  onChange={(e) => {
                    setPlaying(false)
                    setI(+e.target.value)
                  }}
                  className="accent-primary w-full"
                  aria-label="Klatka sezonu"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Kliknij wykres albo przesuń suwak, żeby zatrzymać się na wybranym dniu. Zieleń rośnie, gdy uprawa się rozwija, a spada po zbiorze; wilgotność
                roślin spada przy stresie wodnym. Zawiera zmodyfikowane dane Copernicus Sentinel {season.year} (ESA).
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
