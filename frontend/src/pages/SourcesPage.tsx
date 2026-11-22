import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, CloudSun, Database, Layers, Loader2, MapPinned, RefreshCw, Satellite, ShieldCheck, Sprout } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchStatus, type ServiceState, type Status } from '@/components/ServiceBanner'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** How a report is built – the KOWR sequence, with the data each step uses. */
const STEPS = [
  {
    icon: MapPinned,
    title: 'Działka',
    text: 'Granice i powierzchnia z ewidencji gruntów (ULDK GUGiK) po numerze działki lub kliknięciu na mapie.',
    data: ['ULDK GUGiK', 'ortofotomapa GUGiK'],
  },
  {
    icon: CloudSun,
    title: 'Bilans wodny',
    text: 'Klimatyczny bilans wodny (opad minus parowanie ET₀ wg FAO-56) w oknach 60-dniowych z 10 lat, porównany z progami suszy IUNG-PIB dla gleby i uprawy.',
    data: ['Open-Meteo / NASA POWER', 'progi IUNG-PIB', 'FAO-56'],
  },
  {
    icon: Layers,
    title: 'Przyczyny',
    text: 'Gleba (kategoria IUNG, skład i węgiel organiczny SoilGrids), spadki terenu (NMT), rowy melioracyjne (BDOT10k) i otoczenie: wody, lasy, mokradła.',
    data: ['IUNG-PIB', 'SoilGrids', 'NMT GUGiK', 'BDOT10k'],
  },
  {
    icon: Sprout,
    title: 'Działania',
    text: 'Reguły z warunkami na zmierzonych danych, w kolejności KOWR: krajobraz → gleba → agrotechnika → nawadnianie (dawka z bilansu FAO-56).',
    data: ['NWRM', 'CDR 2025', 'prognoza opadów 7 dni'],
  },
  {
    icon: Satellite,
    title: 'Kontrola z satelity',
    text: 'Wilgotność (NDMI) i zieleń roślin (NDVI) z Sentinel-2 na tle tej samej pory roku w poprzednich latach.',
    data: ['Copernicus Sentinel-2'],
  },
]

type Row = { data: string; use: string; source: string; license: string; refresh: string }
const SOURCES: Row[] = [
  { data: 'Granice działek', use: 'kształt, powierzchnia, położenie', source: 'GUGiK – ULDK', license: 'otwarte dane GUGiK', refresh: 'zapamiętane na stałe' },
  { data: 'Mapa: ortofotomapa i granice', use: 'wybór działki na mapie', source: 'GUGiK – WMTS ORTO, KIEG', license: 'otwarte dane GUGiK', refresh: 'na żywo' },
  {
    data: 'Ukształtowanie terenu',
    use: 'spadki, najniższy punkt działki',
    source: 'GUGiK – NMT',
    license: 'otwarte dane GUGiK',
    refresh: 'zapamiętane na stałe',
  },
  { data: 'Rowy melioracyjne i cieki', use: 'zastawki na rowach', source: 'GUGiK – BDOT10k', license: 'otwarte dane GUGiK', refresh: 'zapamiętane na stałe' },
  {
    data: 'Kategoria gleby, otoczenie',
    use: 'progi suszy, wody i lasy wokół',
    source: 'IUNG-PIB (System Monitoringu Suszy Rolniczej)',
    license: 'udostępniane publicznie przez IUNG-PIB',
    refresh: 'zapamiętane na stałe',
  },
  {
    data: 'Skład gleby, węgiel organiczny',
    use: 'pojemność wodna gleby',
    source: 'ISRIC SoilGrids 2.0',
    license: 'CC BY 4.0',
    refresh: 'zapamiętane na stałe',
  },
  {
    data: 'Pogoda z 10 lat',
    use: 'bilans wodny i historia susz',
    source: 'Open-Meteo (ERA5); zapasowo NASA POWER',
    license: 'CC BY 4.0 / dane publiczne NASA',
    refresh: 'co 1 dzień',
  },
  {
    data: 'Prognoza pogody',
    use: 'opady na 7 dni, analiza do 16 dni naprzód',
    source: 'Open-Meteo; zapasowo MET Norway',
    license: 'CC BY 4.0',
    refresh: 'co 3 godziny',
  },
  {
    data: 'Zdjęcia satelitarne',
    use: 'NDMI, NDVI, podgląd pola',
    source: 'Copernicus Sentinel-2 L2A (ESA) przez Earth Search',
    license: 'wolny i otwarty dostęp Copernicus',
    refresh: 'nowe zdjęcia co kilka dni',
  },
  {
    data: 'Wyszukiwanie miejscowości',
    use: 'przesunięcie mapy',
    source: 'GUGiK – UUG; zapasowo OpenStreetMap Nominatim',
    license: 'otwarte dane GUGiK / ODbL',
    refresh: 'co 30 dni',
  },
]

/** The confidence rule of the report (backend/app/routers/analysis.py) in plain words. */
const CONFIDENCE = [
  { cut: '−2', text: 'brak kategorii gleby IUNG – bez niej nie da się porównać bilansu z progiem suszy' },
  { cut: '−1', text: 'gleba organiczna lub teren nierolniczy – progi IUNG dotyczą gleb mineralnych pod uprawą' },
  { cut: '−1', text: 'niepełne dane pogodowe w ocenianym okresie' },
  { cut: '−1', text: 'pogoda z zapasowego źródła NASA POWER (gdy Open-Meteo nie odpowiada) – siatka ok. 50 km zamiast 10–25 km' },
  { cut: '−1', text: 'data analizy dalej niż 7 dni naprzód – drugi tydzień prognozy jest wyraźnie mniej pewny' },
]

const STATE: Record<ServiceState['state'], { label: string; variant: 'success' | 'warning' | 'error' }> = {
  ok: { label: 'działa', variant: 'success' },
  limit: { label: 'limit zapytań', variant: 'warning' },
  down: { label: 'nie odpowiada', variant: 'error' },
}
const DOT: Record<ServiceState['state'], string> = { ok: 'bg-success', limit: 'bg-status-warning', down: 'bg-error' }

const N = STEPS.length
const mod = (i: number) => ((i % N) + N) % N

/**
 * "Jak powstaje raport" as an orbit seen slightly from above: the steps circle on an ellipse and wrap around endlessly.
 * The step at the front is the selected one (large, with its description); the further back, the smaller, higher and
 * paler. Drag / swipe or scroll sideways, use the arrows / arrow keys, or click a step to bring it to the front.
 */
function StepsOrbit() {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [pos, setPos] = useState(0) // continuous position: 0 = step 1 in front, 1 = step 2 …; unbounded, so it wraps
  const posRef = useRef(0)
  const anim = useRef<number | null>(null)
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null)
  const wheelSnap = useRef<number | null>(null)
  const justDragged = useRef(false) // the click that ends a drag must not also pick a step

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const set = (p: number) => {
    posRef.current = p
    setPos(p)
  }
  /** animate along the orbit (not straight across it) to position `to` */
  const animateTo = (to: number) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    const from = posRef.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) return set(to)
    const t0 = performance.now()
    const dur = 450 + 120 * Math.min(3, Math.abs(to - from))
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - k, 3) // ease-out cubic
      set(from + (to - from) * e)
      anim.current = k < 1 ? requestAnimationFrame(tick) : null
    }
    anim.current = requestAnimationFrame(tick)
  }
  const step = (d: number) => animateTo(Math.round(posRef.current) + d)
  /** bring step i to the front the short way round */
  const goTo = (i: number) => {
    const cur = Math.round(posRef.current)
    let d = mod(i - cur)
    if (d > N / 2) d -= N
    animateTo(cur + d)
  }

  const active = mod(Math.round(pos))
  const narrow = width < 520
  const rx = Math.min(width * (narrow ? 0.36 : 0.4), 420) // orbit radii: wide and flat = view from above
  const ry = Math.min(70, rx * 0.22)
  const front = 2 * ry + 70 // y of the front item's icon centre: room above for the back of the orbit
  const stageH = front + 120 // and below for the front step's name

  return (
    <div className="grid gap-4">
      <div
        ref={box}
        style={{ height: stageH }}
        className="focus-visible:ring-ring/50 relative touch-pan-y overflow-hidden rounded-xl outline-none select-none focus-visible:ring-[3px]"
        role="region"
        aria-roledescription="karuzela"
        aria-label="Kroki raportu – przeciągnij w bok albo użyj strzałek"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1)
          if (e.key === 'ArrowLeft') step(-1)
        }}
        onPointerDown={(e) => {
          if (anim.current) cancelAnimationFrame(anim.current)
          drag.current = { x: e.clientX, start: posRef.current, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          if (Math.abs(dx) > 4 && !d.moved) {
            d.moved = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          if (d.moved) set(d.start - dx / (rx * 0.9)) // drag left = next step comes to the front
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (d?.moved) {
            justDragged.current = true
            setTimeout(() => (justDragged.current = false), 0)
            animateTo(Math.round(posRef.current))
          }
        }}
        onPointerCancel={() => {
          drag.current = null
          animateTo(Math.round(posRef.current))
        }}
        onWheel={(e) => {
          const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
          if (!dx) return // plain vertical wheel keeps scrolling the page
          if (anim.current) cancelAnimationFrame(anim.current)
          set(posRef.current + dx / 400)
          if (wheelSnap.current) clearTimeout(wheelSnap.current)
          wheelSnap.current = window.setTimeout(() => animateTo(Math.round(posRef.current)), 140)
        }}
      >
        {/* the orbit itself */}
        <div
          className="border-primary/25 pointer-events-none absolute left-1/2 rounded-[50%] border-2 border-dashed"
          style={{ width: rx * 2, height: ry * 2, top: front - 2 * ry, transform: 'translateX(-50%)' }}
          aria-hidden
        />
        <div
          className="bg-primary/10 pointer-events-none absolute left-1/2 rounded-[50%] blur-xl"
          style={{ width: rx * 1.3, height: ry * 1.2, top: front - ry * 1.6, transform: 'translateX(-50%)' }}
          aria-hidden
        />

        <ol>
          {STEPS.map((s, i) => {
            const theta = ((i - pos) * 2 * Math.PI) / N
            const depth = (Math.cos(theta) + 1) / 2 // 1 = front, 0 = back
            const x = Math.sin(theta) * rx
            const y = front - (1 - Math.cos(theta)) * ry
            const scale = 0.5 + 0.5 * Math.pow(depth, 1.4)
            const on = i === active
            return (
              <li
                key={s.title}
                className={cn('absolute top-0 left-1/2', narrow ? 'w-28' : 'w-44')}
                style={{
                  transform: `translate(-50%, -40px) translate(${x}px, ${y}px) scale(${scale})`,
                  transformOrigin: '50% 40px',
                  zIndex: Math.round(depth * 100),
                  opacity: 0.25 + 0.75 * depth,
                }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => !justDragged.current && goTo(i)}
                  aria-current={on ? 'step' : undefined}
                  className="flex w-full flex-col items-center gap-2"
                >
                  <span
                    className={cn(
                      'grid size-20 place-items-center rounded-full border-4 transition-colors duration-300',
                      on ? 'bg-primary text-primary-foreground border-primary-container shadow-xl' : 'bg-card text-foreground border-border',
                    )}
                  >
                    <s.icon className="size-9" aria-hidden />
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">Krok {i + 1}</span>
                  <span className="text-center text-lg leading-tight font-semibold">{s.title}</span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* big, light chevrons; on phones they sit below the orbit so they never cover a step */}
        {([-1, 1] as const).map((d) => {
          const Icon = d < 0 ? ChevronLeft : ChevronRight
          return (
            <button
              key={d}
              type="button"
              onClick={() => step(d)}
              aria-label={d < 0 ? 'Poprzedni krok' : 'Następny krok'}
              className={cn(
                'text-foreground/25 hover:text-foreground/60 active:text-primary absolute z-[200] -translate-y-1/2 transition-colors',
                d < 0 ? '-left-2' : '-right-2',
              )}
              style={{ top: narrow ? front + 95 : front - ry }}
            >
              <Icon className={narrow ? 'size-12' : 'size-16'} strokeWidth={2.75} aria-hidden />
            </button>
          )
        })}
      </div>

      {/* only the front step's description */}
      <div key={active} className="animate-fade-up mx-auto grid min-h-28 max-w-xl content-start gap-3 px-2 text-center" aria-live="polite">
        <p className="text-pretty">{STEPS[active].text}</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {STEPS[active].data.map((d) => (
            <Badge key={d} variant="outline">
              {d}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Collapsed by default (native <details>: keyboard and screen readers work out of the box). */
function Collapsible({ icon, title, summary, children }: { icon: ReactNode; title: string; summary: string; children: ReactNode }) {
  return (
    <details className="group bg-card overflow-hidden rounded-xl border">
      <summary className="hover:bg-muted/60 flex cursor-pointer list-none items-center gap-3 p-4 select-none [&::-webkit-details-marker]:hidden">
        <span className="text-primary shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="text-muted-foreground block text-sm">{summary}</span>
        </span>
        <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t">{children}</div>
    </details>
  )
}

function LiveStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [checking, setChecking] = useState(false)
  const [at, setAt] = useState<Date | null>(null)
  const load = useCallback(async (fresh = false) => {
    setChecking(true)
    setStatus(await fetchStatus(fresh))
    setAt(new Date())
    setChecking(false)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const services = status && 'groups' in status ? status.groups.flatMap((g) => g.services) : []
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-title">Stan usług na żywo</h2>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={checking}>
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sprawdź
        </Button>
      </div>
      {!status && <p className="text-muted-foreground text-sm">Sprawdzam…</p>}
      {status && 'offline' in status && <p className="text-error text-sm font-medium">Brak połączenia z serwerem Retentoor.</p>}
      <ul className="divide-y border-y">
        {services.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-3 py-2.5">
            <span>{s.name}</span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn('size-2.5 rounded-full', DOT[s.state])} aria-hidden />
              {STATE[s.state].label}
            </span>
          </li>
        ))}
      </ul>
      {at && <p className="text-muted-foreground text-xs">Sprawdzono {formatDateTime(at)}. Prognoza działa, jeśli odpowiada choć jedno z dwóch źródeł.</p>}
    </section>
  )
}

export default function SourcesPage() {
  return (
    <div className="grid gap-8">
      <div className="max-w-3xl">
        <h1 className="type-headline sm:type-display">Źródła i metoda</h1>
        <p className="text-muted-foreground mt-1 text-pretty">
          Skąd Retentoor bierze dane, jak z nich liczy ocenę i dlaczego czasem pokazuje niższą pewność. Wszystko pochodzi z publicznych, otwartych źródeł i jest
          liczone na bieżąco dla wskazanej działki.
        </p>
      </div>

      <section className="grid gap-3">
        <h2 className="type-title">Jak powstaje raport</h2>
        <StepsOrbit />
      </section>

      <LiveStatus />

      <section className="grid gap-3">
        <Collapsible
          icon={<ShieldCheck className="size-5" aria-hidden />}
          title="Skąd poziom pewności"
          summary="Dlaczego ta sama działka raz ma pewność wysoką, a raz średnią."
        >
          <div className="grid gap-3 p-4">
            <p className="text-muted-foreground text-sm">
              Każdy raport ma pewność: wysoką, średnią lub niską. Zaczynamy od wysokiej (3 punkty) i odejmujemy za każdy brak w danych – np. gdy Open-Meteo
              chwilowo nie odpowiada i używamy NASA POWER.
            </p>
            <ul className="grid gap-2 text-sm">
              {CONFIDENCE.map((c) => (
                <li key={c.text} className="flex gap-3">
                  <span className="bg-muted w-9 shrink-0 rounded-sm text-center font-mono text-xs leading-6 font-semibold">{c.cut}</span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Wynik: 3 punkty = wysoka, 2 = średnia, mniej = niska. Raport zawsze wypisuje brakujące dane i ograniczenia, żeby było widać, skąd ta ocena.
            </p>
          </div>
        </Collapsible>

        <Collapsible
          icon={<Database className="size-5" aria-hidden />}
          title="Skąd dane"
          summary={`${SOURCES.length} rodzajów danych z publicznych źródeł: GUGiK, IUNG-PIB, Open-Meteo, NASA, MET Norway, ISRIC, Copernicus.`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Dane</TableHead>
                <TableHead className="hidden md:table-cell">Do czego</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead className="hidden sm:table-cell">Licencja</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">Odświeżanie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SOURCES.map((r) => (
                <TableRow key={r.data}>
                  <TableCell className="pl-4 font-medium whitespace-normal">{r.data}</TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-normal md:table-cell">{r.use}</TableCell>
                  <TableCell className="whitespace-normal">{r.source}</TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-normal sm:table-cell">{r.license}</TableCell>
                  <TableCell className="text-muted-foreground hidden pr-4 whitespace-normal lg:table-cell">{r.refresh}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Collapsible>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Twoje dane</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Nie zakładasz konta. „Moje pola” i ich ostatnie wyniki są zapisane tylko w Twojej przeglądarce.</p>
            <p>
              Serwer zapamiętuje wyłącznie odpowiedzi publicznych usług (pogoda, gleba, granice działek), żeby kolejne raporty liczyły się szybciej. Nie ma kont
              ani bazy użytkowników.
            </p>
            <p>Link do raportu zawiera tylko numer działki, uprawę i datę – raport liczy się od nowa po otwarciu.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ograniczenia</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Pogoda pochodzi z modeli i reanaliz w siatce kilku–kilkudziesięciu km, a nie ze stacji przy polu. Lokalna burza może nie być widoczna.</p>
            <p>
              Mapy glebowe mają skalę regionalną; na małej działce gleba może się różnić od mapy. Satelita widzi pole w pikselach 10–20 m i tylko bez chmur.
            </p>
            <p>Raport ma charakter informacyjny. Inwestycje wodne i pobór wody konsultuj z doradcą rolnym i Wodami Polskimi.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
