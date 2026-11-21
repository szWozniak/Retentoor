import { AlertTriangle, CheckCircle2, CircleHelp, Droplets, Info } from 'lucide-react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, XAxis, YAxis } from 'recharts'
import type { Analysis } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { KpiCard } from '@/components/charts'
import { CausesSection, CropComparison, RecommendationsSection } from './AdviceSections'
import { formatDate, formatDateShort, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Signed millimetres with a real minus sign (U+2212), e.g. "−146 mm", "+12 mm". */
const mm = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}\u00a0mm`
/** Threshold text, e.g. "−184 mm". */
const thr = (v: number | string | null | undefined) => (typeof v === 'number' ? mm(v) : '–')

const SECTIONS = [
  { id: 'ocena', label: 'Ocena' },
  { id: 'historia', label: 'Historia' },
  { id: 'przyczyny', label: 'Przyczyny' },
  { id: 'rekomendacje', label: 'Rekomendacje' },
  { id: 'uprawy', label: 'Uprawy' },
  { id: 'zrodla', label: 'Źródła' },
]

function SectionNav() {
  return (
    <nav
      aria-label="Sekcje raportu"
      className="no-print bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-[1100] -mx-4 border-b px-4 py-2 backdrop-blur"
    >
      <ul className="flex gap-1 overflow-x-auto text-sm">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="text-muted-foreground hover:text-foreground hover:bg-muted block rounded-md px-3 py-1.5 whitespace-nowrap transition-colors"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function StatusBanner({ a }: { a: Analysis }) {
  const lp = a.current.last_period
  const w = a.current.window
  let tone: 'bad' | 'warn' | 'ok' | 'unknown' = 'unknown'
  let title = 'Nie można jednoznacznie ocenić suszy'
  let text = ''

  if (lp && lp.drought) {
    tone = 'bad'
    title = 'Susza rolnicza dla tej uprawy'
    text = `W ostatnim zakończonym okresie (${lp.period}) bilans wodny wyniósł ${mm(lp.kbw)}, poniżej progu ${thr(lp.threshold)} dla uprawy „${a.crop.name.toLowerCase()}” na glebie kat. ${a.soil.category_used}.`
  } else if (lp && lp.drought === false) {
    const close = lp.margin !== null && lp.margin < 30
    tone = close ? 'warn' : 'ok'
    title = close ? 'Blisko progu suszy' : 'Brak suszy rolniczej'
    text = `W ostatnim zakończonym okresie (${lp.period}) bilans wodny wyniósł ${mm(lp.kbw)} przy progu suszy ${thr(lp.threshold)} – zapas ${Math.round(lp.margin ?? 0)}\u00a0mm.`
  } else if (w.kbw !== null) {
    text = !a.current.in_season
      ? `Data poza okresem monitoringu suszy IUNG (21.III–30.IX). Bilans wodny z ostatnich 60 dni: ${mm(w.kbw)}.`
      : `Dla tej uprawy w bieżącym okresie nie ma progu suszy (brak spadków plonu w tym czasie). Bilans z ostatnich 60 dni: ${mm(w.kbw)}.`
  }

  // top 3 actions: highest priority first, keeping the retention-first order within the same priority
  const rank = { wysoki: 0, średni: 1, niski: 2 } as const
  // retention before irrigation (KOWR): irrigation can only take the 3rd slot, and only when it's advised
  const ranked = [...a.recommendations]
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.stage !== 'nawadnianie')
    .sort((x, y) => rank[x.r.priority] - rank[y.r.priority] || x.i - y.i)
    .map((x) => x.r)
  const irrigation = a.recommendations.find((r) => r.stage === 'nawadnianie' && a.irrigation?.decision === 'zasadne')
  const top = irrigation ? [...ranked.slice(0, 2), irrigation] : ranked.slice(0, 3)

  const Icon = tone === 'bad' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : CircleHelp
  return (
    <div
      role="status"
      className={cn(
        'flex gap-3 rounded-xl border p-4 sm:p-5',
        tone === 'bad' && 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100',
        tone === 'warn' && 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        tone === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
        tone === 'unknown' && 'bg-muted',
      )}
    >
      <Icon className="mt-1 size-6 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide uppercase opacity-70">W skrócie</p>
        <p className="text-lg font-semibold">{title}</p>
        {text && <p className="mt-0.5 text-sm">{text}</p>}
        {top.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-sm font-medium">Najważniejsze działania:</p>
            <ol className="grid gap-1.5 text-sm sm:grid-cols-3">
              {top.map((r, i) => (
                <li key={r.id}>
                  <a
                    href="#rekomendacje"
                    className="flex h-full gap-2 rounded-md bg-white/60 px-2.5 py-1.5 transition-colors hover:bg-white/90 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span className="font-semibold tabular-nums">{i + 1}.</span>
                    <span>{r.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

function KbwChart({ a }: { a: Analysis }) {
  const data = a.series.map((s) => ({ ...s }))
  const config = {
    kbw: { label: `KBW 60 dni (${new Date(a.analysis_date).getFullYear()})`, color: 'var(--chart-1)' },
    median: { label: 'Mediana z 10 lat', color: 'var(--chart-2)' },
    threshold: { label: 'Próg suszy IUNG (koniec okresu)', color: 'var(--status-critical)' },
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} tickFormatter={(v) => formatDateShort(v)} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v < 0 ? '−' : ''}${Math.abs(v)}`} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => formatDate(p?.[0]?.payload?.date)} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Line dataKey="median" stroke="var(--color-median)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
        <Line dataKey="kbw" stroke="var(--color-kbw)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        <Scatter dataKey="threshold" fill="var(--color-threshold)" shape="diamond" isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  )
}

function HistoryGrid({ a }: { a: Analysis }) {
  const periods = a.history.years[0]?.periods.map((p) => p.period) ?? []
  if (!periods.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="text-muted-foreground pr-2 text-left font-normal">Rok</th>
            {periods.map((p) => (
              <th key={p} className="text-muted-foreground px-0.5 font-normal whitespace-nowrap" title={p}>
                {p.split('-')[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.history.years.map((y) => (
            <tr key={y.year}>
              <td className="pr-2 font-medium tabular-nums">{y.year}</td>
              {y.periods.map((p) => (
                <td
                  key={p.period}
                  title={`${y.year}, ${p.period}: KBW ${mm(p.kbw)}${typeof p.threshold === 'number' ? `, próg ${thr(p.threshold)}` : ''}`}
                  className={cn(
                    'h-6 min-w-6 rounded-sm text-center',
                    p.drought === true && 'bg-status-critical font-bold text-white',
                    p.drought === false && 'bg-emerald-100 dark:bg-emerald-900/35',
                    p.drought === null && 'bg-muted',
                  )}
                >
                  {p.drought === true ? '!' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-2 text-xs">
        <span className="bg-status-critical mr-1 inline-block size-3 rounded-sm align-middle" /> susza (KBW poniżej progu)
        <span className="mr-1 ml-3 inline-block size-3 rounded-sm bg-emerald-100 align-middle" /> bez suszy
        <span className="bg-muted mr-1 ml-3 inline-block size-3 rounded-sm align-middle" /> brak progu dla uprawy w tym okresie
      </p>
    </div>
  )
}

export function AnalysisResult({ a, onLocate }: { a: Analysis; onLocate?: (lat: number, lon: number) => void }) {
  const w = a.current.window
  const worst = [...a.history.period_frequency].sort((x, y) => y.share - x.share)[0]

  return (
    <div className="grid gap-4">
      <SectionNav />
      <section id="ocena" data-section className="grid gap-4">
      <StatusBanner a={a} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Bilans wodny, ostatnie 60 dni"
          value={mm(w.kbw)}
          hint={w.median_hist !== null ? `mediana z 10 lat: ${mm(w.median_hist)}` : undefined}
          icon={<Droplets className="size-4" />}
        />
        <KpiCard
          label="Na tle wielolecia"
          value={w.percentile !== null ? `${w.percentile}. percentyl` : '–'}
          hint={w.percentile !== null ? (w.percentile <= 20 ? 'jeden z najsuchszych okresów' : w.percentile >= 80 ? 'wilgotniej niż zwykle' : 'typowo') : undefined}
        />
        <KpiCard
          label="Lata z suszą (z 10)"
          value={a.history.years_total ? `${a.history.years_with_drought} / ${a.history.years_total}` : '–'}
          hint={worst && worst.share > 0 ? `najczęściej w okresie ${worst.period}` : 'w żadnym okresie'}
        />
        <KpiCard
          label="Gleba (IUNG)"
          value={a.soil.category ? `kat. ${a.soil.category}` : a.soil.code === 5 ? 'organiczna' : '–'}
          hint={`${a.soil.n_points} pkt w działce`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bilans wodny w {new Date(a.analysis_date).getFullYear()} r. na tle wielolecia</CardTitle>
          <CardDescription>
            Opad minus parowanie w kroczącym oknie 60 dni, w mm (metoda IUNG). Im niżej, tym bardziej sucho. Romby to progi suszy dla wybranej uprawy i gleby.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KbwChart a={a} />
        </CardContent>
      </Card>

      </section>

      {a.history.years.length > 0 && (
        <Card id="historia" data-section>
          <CardHeader>
            <CardTitle>Historia suszy na tej działce (10 lat)</CardTitle>
            <CardDescription>Każda kratka to jeden 60-dniowy okres IUNG.<span className="no-print"> Najedź, by zobaczyć wartości.</span></CardDescription>
          </CardHeader>
          <CardContent>
            <HistoryGrid a={a} />
          </CardContent>
        </Card>
      )}

      <div id="przyczyny" data-section>
        <CausesSection a={a} />
      </div>
      <div id="rekomendacje" data-section>
        <RecommendationsSection a={a} onLocate={onLocate} />
      </div>
      <div id="uprawy" data-section>
        <CropComparison a={a} />
      </div>

      <Card id="zrodla" data-section>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" /> Wiarygodność i źródła
            <Badge variant={a.confidence === 'wysoki' ? 'default' : a.confidence === 'średni' ? 'secondary' : 'outline'}>
              pewność: {a.confidence}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {a.missing.length > 0 && (
            <div>
              <p className="mb-1 font-medium">Brakujące dane</p>
              <ul className="list-disc space-y-1 pl-5">{a.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          <div>
            <p className="mb-1 font-medium">Ograniczenia</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">{a.limitations.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <div>
            <p className="mb-1 font-medium">Źródła danych</p>
            <ul className="text-muted-foreground space-y-1">
              {a.sources.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.name}</a>
                  {s.range && <> · zakres {s.range}</>}
                  {s.fetched_at && <> · pobrano {formatDateTime(s.fetched_at)}</>}
                  {s.license && <> · {s.license}</>}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground text-xs">Analiza na dzień {formatDate(a.analysis_date)} · wyliczona w {a.elapsed_s} s</p>
        </CardContent>
      </Card>
    </div>
  )
}
