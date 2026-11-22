import { useCallback, useEffect, useState } from 'react'
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ChevronDown, Loader2 } from 'lucide-react'
import { api, type Analysis, type Runoff, type WaterMeasure } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ORTHO_WMTS } from '@/components/map/ParcelMap'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const WATER = '#38bdf8' // runoff core: light sky blue
const WATER_GLOW = '#0369a1' // wider, darker halo under it – reads on light and dark fields

const m3 = (v: number) => `${formatNumber(Math.round(v))} m³`
const pct = (v: number) => `${Math.round(v * 100)}%`

/** "0,8 dnia", "1 dzień", "5 dni" – crop water use equivalent */
function daysText(d: number) {
  const r = d < 10 ? Math.round(d * 10) / 10 : Math.round(d)
  const txt = formatNumber(r)
  if (r === 1) return '1 dzień'
  return Number.isInteger(r) && r >= 2 ? `${txt} dni` : `${txt} dnia`
}

type Item = WaterMeasure & { tag: string }

function Stat({ label, value, hint, loading }: { label: string; value: string; hint?: string; loading?: boolean }) {
  return (
    <div className="bg-muted/60 rounded-lg p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="type-headline mt-0.5 tabular-nums">{loading ? <Loader2 className="text-muted-foreground my-1.5 size-5 animate-spin" /> : value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

type LatLon = [number, number]
type Stream = Runoff['streams'][number]

/**
 * D8 links -> smooth rivers: chain links from each source downstream (stopping where a branch joins one already drawn),
 * split chains where the width class changes, then round the corners (Chaikin). Avoids the staircase look of grid cells.
 */
function rivers(streams: Stream[]) {
  const k = (p: LatLon) => `${p[0]},${p[1]}`
  const next = new Map<string, Stream>()
  const fed = new Set<string>()
  for (const s of streams) {
    next.set(k(s.path[0]), s)
    fed.add(k(s.path[1]))
  }
  const seen = new Set<string>()
  const out: { line: LatLon[]; w: number; on: boolean }[] = []
  for (const s of streams) {
    if (fed.has(k(s.path[0]))) continue // not a source
    let p: LatLon = s.path[0]
    let cur: { line: LatLon[]; w: number; on: boolean } | null = null
    while (next.has(k(p))) {
      const link = next.get(k(p))!
      const w = Math.round(link.w)
      if (!cur || cur.w !== w) {
        if (cur) out.push(cur)
        cur = { line: [p], w, on: link.on }
      }
      cur.line.push(link.path[1])
      cur.on ||= link.on
      p = link.path[1]
      if (seen.has(k(p))) break
      seen.add(k(p))
    }
    if (cur) out.push(cur)
  }
  return out.map((r) => ({ ...r, line: chaikin(chaikin(r.line)) }))
}

function chaikin(pts: LatLon[]): LatLon[] {
  if (pts.length < 3) return pts
  const out: LatLon[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]]
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
  }
  out.push(pts[pts.length - 1])
  return out
}

const ARROW: Record<string, string> = {
  północ: '↑',
  'północny wschód': '↗',
  wschód: '→',
  'południowy wschód': '↘',
  południe: '↓',
  'południowy zachód': '↙',
  zachód: '←',
  'północny zachód': '↖',
}

/** One label style for every point on the map (no legend needed): a small pill, green only for the pond. */
const pin = (html: string, kind: 'dark' | 'pond' = 'dark') =>
  L.divIcon({ className: '', iconSize: [0, 0], html: `<span class="runoff-pin runoff-pin--${kind}">${html}</span>` })

function RunoffMap({ a, r }: { a: Analysis; r: Runoff }) {
  const bounds = L.geoJSON(a.parcel.geometry).getBounds().pad(0.2)
  // off the parcel only the main streams – the parcel is the subject, the rest is context
  const all = rivers(r.streams).filter((x) => x.on || x.w >= 3)
  // on an even slope water runs in many parallel threads – keep the 30 that matter most (thickness × length)
  const rv = [...all].sort((x, y) => y.w * y.line.length - x.w * x.line.length).slice(0, 30)
  // a label at the pond spot merges into the pond pill instead of overlapping it
  const near = (p: { lat: number; lon: number }) => !!r.pond && Math.hypot(p.lat - r.pond.lat, (p.lon - r.pond.lon) * 0.62) < r.step_m * 2.5 * 9e-6
  const outlets = r.outlets.filter((o) => !near(o))
  const sinks = r.sinks.filter((x) => !near(x))
  const merged = r.outlets.find(near) ?? null
  const pondText = merged ? `oczko · ${ARROW[merged.dir] ?? ''} ${pct(merged.share)} ucieka` : 'oczko'
  const width = (w: number) => 1.5 + w * 1.3
  return (
    <figure className="grid gap-2 lg:h-full">
      <div className="runoff-map relative h-[340px] overflow-hidden rounded-lg select-none lg:h-full lg:min-h-[380px]">
        <MapContainer bounds={bounds} maxZoom={19} zoomSnap={0.25} zoomControl={false} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer url={ORTHO_WMTS} maxNativeZoom={19} maxZoom={19} className="runoff-base" attribution="Ortofotomapa &copy; GUGiK · spływ: NMT GUGiK" />
          <GeoJSON
            data={a.parcel.geometry}
            interactive={false}
            style={{ color: '#fff', weight: 2, opacity: 0.9, dashArray: '6 5', fillColor: '#fff', fillOpacity: 0.06 }}
          />
          {rv.map((x, i) => (
            <Polyline
              key={`g${i}`}
              positions={x.line}
              interactive={false}
              pathOptions={{ color: WATER_GLOW, weight: width(x.w) + 5, opacity: x.on ? 0.35 : 0.15, lineCap: 'round', lineJoin: 'round' }}
            />
          ))}
          {rv.map((x, i) => (
            <Polyline
              key={`r${i}`}
              positions={x.line}
              interactive={false}
              pathOptions={{ color: WATER, weight: width(x.w), opacity: x.on ? 1 : 0.45, lineCap: 'round', lineJoin: 'round' }}
            />
          ))}
          {/* moving dashes: water flowing downstream */}
          {rv
            .filter((x) => x.on && x.w >= 2)
            .map((x, i) => (
              <Polyline
                key={`f${i}`}
                positions={x.line}
                interactive={false}
                pathOptions={{
                  color: '#fff',
                  weight: Math.max(1.5, width(x.w) / 3),
                  opacity: 0.8,
                  dashArray: '1 14',
                  lineCap: 'round',
                  className: 'runoff-flow',
                }}
              />
            ))}
          {r.arrows.map((p, i) => (
            <Polyline key={`a${i}`} positions={p} interactive={false} pathOptions={{ color: '#fff', weight: 1.2, opacity: 0.6, lineCap: 'round' }} />
          ))}
          {sinks.map((s) => (
            <Marker key={`k${s.lat}`} position={[s.lat, s.lon]} interactive={false} icon={pin('<i class="runoff-dot"></i>zbiera się')} />
          ))}
          {outlets.map((o) => (
            <Marker key={`o${o.lat}`} position={[o.lat, o.lon]} interactive={false} icon={pin(`${ARROW[o.dir] ?? ''} ${pct(o.share)} ucieka`)} />
          ))}
          {r.pond && <Marker position={[r.pond.lat, r.pond.lon]} interactive={false} icon={pin(pondText, 'pond')} zIndexOffset={1000} />}
        </MapContainer>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        Niebieskie linie: którędy płynie woda po ulewie – im grubsza, tym więcej wody. Białe strzałki: spadek terenu na działce.
      </figcaption>
    </figure>
  )
}

function MeasureRow({ m, max }: { m: Item; max: number }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{m.title}</span>
        <span className="type-title-sm shrink-0 tabular-nums">{m3(m.m3)}</span>
      </div>
      <span className="bg-muted h-2.5 overflow-hidden rounded-full">
        <span className="bg-primary block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, (m.m3 / max) * 100)}%` }} />
      </span>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <span>
          {m.tag} · tyle wody uprawa zużywa latem przez <b className="text-foreground">{daysText(m.days)}</b>
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="hover:text-foreground flex items-center gap-0.5">
          założenia <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      {open && (
        <ul className="text-muted-foreground list-disc pl-5 text-xs">
          {m.assumptions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** "Woda na Twojej działce": where water runs off (flow model on the NMT) and how much each measure would keep. */
export function WaterCard({ a }: { a: Analysis }) {
  const [r, setR] = useState<Runoff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const w = a.water

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api
      .runoff(a.parcel.id)
      .then((d) => alive && setR(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [a.parcel.id])
  useEffect(() => load(), [load])

  const items: Item[] = [
    ...(r?.pond && w
      ? [
          {
            id: 'pond',
            title: 'Oczko lub niecka tam, gdzie zbiera się woda',
            m3: r.pond.storm_m3,
            days: r.pond.storm_m3 / w.use_m3_day,
            permanent: false,
            tag: 'z każdej ulewy',
            assumptions: [
              `zlewnia tego miejsca: ${formatNumber(r.pond.catchment_ha)} ha (z modelu spływu)`,
              `ulewa ${r.pond.storm_mm} mm, z czego ok. ${Math.round(r.pond.runoff_coef * 100)}% spływa po powierzchni pola`,
              `zbiornik ok. ${formatNumber(r.pond.pond_m2)} m² przy głębokości 1 m`,
            ],
          },
        ]
      : []),
    ...(w?.measures ?? []).map((m) => ({ ...m, tag: m.permanent ? 'na stałe w glebie' : 'co sezon' })),
  ].sort((x, y) => y.m3 - x.m3)
  const max = Math.max(1, ...items.map((i) => i.m3))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Woda na Twojej działce</CardTitle>
        <CardDescription>Skąd przychodzi, którędy ucieka i ile możesz jej zatrzymać – z modelu terenu GUGiK i pogody z 10 lat.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {w && <Stat label="Rocznie spada na działkę" value={m3(w.rain_year_m3)} hint={`${formatNumber(w.rain_year_mm)} mm średnio w latach ${w.years}`} />}
          <Stat
            label="Z jednej ulewy 30 mm ucieka"
            value={r ? m3(r.storm_loss_m3) : '–'}
            hint={r ? (r.kept_share >= 0.95 ? 'prawie cała woda zostaje na polu' : `${pct(1 - r.kept_share)} spływu opuszcza pole`) : undefined}
            loading={loading}
          />
          <Stat
            label="Na pole spływa woda z sąsiednich"
            value={r ? `${formatNumber(r.inflow_ha)} ha` : '–'}
            hint={r ? (r.inflow_ha >= 0.1 ? 'gruntów położonych wyżej' : 'działka nie zbiera wody z sąsiadów') : undefined}
            loading={loading}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="min-h-0">
            {loading && (
              <div className="bg-muted text-muted-foreground grid h-[340px] place-items-center rounded-lg text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Liczę spływ wody z modelu terenu…
                </span>
              </div>
            )}
            {error && !loading && (
              <div className="bg-muted flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg p-4 text-center text-sm">
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={load}>
                  Spróbuj ponownie
                </Button>
              </div>
            )}
            {r && !loading && <RunoffMap a={a} r={r} />}
          </div>

          <div className="grid content-start gap-4">
            <div>
              <h3 className="type-title-sm">Ile wody zatrzymasz</h3>
              {w && (
                <p className="text-muted-foreground text-sm">
                  Latem „{a.crop.name.toLowerCase()}” zużywa ok. {formatNumber(w.use_mm_day)} mm wody dziennie, czyli {m3(w.use_m3_day)} na całej działce.
                </p>
              )}
            </div>
            <ul className="grid gap-4">
              {items.map((m) => (
                <MeasureRow key={m.id} m={m} max={max} />
              ))}
              {loading && <li className="text-muted-foreground text-sm">Oczko: czekam na model spływu…</li>}
            </ul>
            {r && r.outlets.length > 0 && r.outlets[0].share >= 0.15 && (
              <p className="bg-muted rounded-md px-3 py-2 text-sm">
                Najwięcej wody ucieka na {r.outlets[0].dir} ({pct(r.outlets[0].share)} spływu z działki). Pas trawy, zadrzewienie lub próg w tym miejscu
                zatrzyma ją na polu.
              </p>
            )}
            {r?.flat && <p className="text-muted-foreground text-sm">{r.notes[0]}</p>}
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Szacunki orientacyjne (rząd wielkości), nie projekt. {r?.notes.at(-1)} Źródło: {r?.source.name ?? 'GUGiK NMT'}, pogoda jak w ocenie powyżej.
        </p>
      </CardContent>
    </Card>
  )
}
