import { AlertTriangle, ArrowDown, CalendarRange, CheckCircle2 } from 'lucide-react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, XAxis, YAxis } from 'recharts'
import type { Analysis } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { KpiCard } from '@/components/charts'
import { CausesSection, CropComparison, RecommendationsSection } from './AdviceSections'
import { ReportOutline } from './ReportOutline'
import { formatDate, formatDateShort, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Signed millimetres with a real minus sign (U+2212), e.g. "−146 mm", "+12 mm". */
const mm = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}\u00a0mm`
/** Threshold text, e.g. "−184 mm". */
const thr = (v: number | string | null | undefined) => (typeof v === 'number' ? mm(v) : '–')

const SECTIONS = [
  { id: 'ocena', label: 'Ocena sytuacji' },
  { id: 'historia', label: 'Historia suszy' },
  { id: 'przyczyny', label: 'Przyczyny' },
  { id: 'rekomendacje', label: 'Co możesz zrobić' },
  { id: 'uprawy', label: 'Porównanie upraw' },
  { id: 'zrodla', label: 'Źródła i wiarygodność' },
]

type Tone = 'bad' | 'warn' | 'ok' | 'info'

const TONE: Record<Tone, { bar: string; chip: string; icon: typeof AlertTriangle }> = {
  bad: { bar: 'border-l-status-critical', chip: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300', icon: AlertTriangle },
  warn: { bar: 'border-l-amber-500', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300', icon: AlertTriangle },
  ok: { bar: 'border-l-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', icon: CheckCircle2 },
  info: { bar: 'border-l-primary', chip: 'bg-primary/10 text-primary', icon: CalendarRange },
}

type Verdict = { tone: Tone; title: string; text: string }

/** Plain-language verdict. Outside the IUNG monitoring season (21.III–30.IX) it summarises the last finished season. */
function verdict(a: Analysis): Verdict {
  const lp = a.current.last_period
  const w = a.current.window
  const crop = a.crop.name.toLowerCase()
  const d = new Date(a.analysis_date)

  if (a.current.in_season && lp && lp.drought !== null) {
    if (lp.drought)
      return {
        tone: 'bad',
        title: 'Susza rolnicza dla tej uprawy',
        text: `W ostatnim zakończonym okresie (${lp.period}) bilans wodny wyniósł ${mm(lp.kbw)}, poniżej progu ${thr(lp.threshold)} dla uprawy „${crop}” na glebie kat. ${a.soil.category_used}.`,
      }
    const close = lp.margin !== null && lp.margin < 30
    return {
      tone: close ? 'warn' : 'ok',
      title: close ? 'Blisko progu suszy' : 'Brak suszy rolniczej',
      text: `W ostatnim zakończonym okresie (${lp.period}) bilans wodny wyniósł ${mm(lp.kbw)} przy progu suszy ${thr(lp.threshold)} – zapas ${Math.round(lp.margin ?? 0)}\u00a0mm.`,
    }
  }

  if (a.current.in_season) {
    return {
      tone: 'info',
      title: 'W tym okresie uprawa nie jest wrażliwa na suszę',
      text: `Dla uprawy „${crop}” IUNG nie wyznacza w tym czasie progu suszy (brak spadków plonu). Bilans wodny z ostatnich 60 dni: ${mm(w.kbw)}.`,
    }
  }

  // outside the season: summarise the last finished season (this year after 30.IX, otherwise last year)
  const afterSeason = d.getMonth() >= 9
  const year = afterSeason ? d.getFullYear() : d.getFullYear() - 1
  const periods = afterSeason
    ? a.current.season_periods.map((p) => ({ period: p.period, drought: p.drought, margin: p.margin }))
    : (a.history.years.find((y) => y.year === year)?.periods ?? []).map((p) => ({
        period: p.period,
        drought: p.drought,
        margin: typeof p.threshold === 'number' && p.kbw !== null ? p.kbw - p.threshold : null,
      }))
  const assessed = periods.filter((p) => p.drought !== null)
  const note = `Monitoring suszy IUNG obejmuje okres 21.III–30.IX, więc podsumowujemy sezon ${year}.`

  if (!assessed.length)
    return { tone: 'info', title: 'Poza sezonem wegetacyjnym', text: `${note} Bilans wodny z ostatnich 60 dni: ${mm(w.kbw)}.` }

  const dry = assessed.filter((p) => p.drought)
  if (dry.length)
    return {
      tone: 'warn',
      title: `Sezon ${year}: susza w ${dry.length === 1 ? 'okresie' : 'okresach'} ${dry.map((p) => p.period).join(', ')}`,
      text: `${note} Bilans wodny spadł poniżej progu suszy dla uprawy „${crop}” na glebie kat. ${a.soil.category_used}.`,
    }
  const tightest = [...assessed].sort((x, y) => (x.margin ?? 1e9) - (y.margin ?? 1e9))[0]
  return {
    tone: 'ok',
    title: `Sezon ${year}: bez suszy rolniczej`,
    text: `${note} Najmniejszy zapas do progu suszy: ${Math.round(tightest.margin ?? 0)}\u00a0mm (okres ${tightest.period}).`,
  }
}

function StatusBanner({ a }: { a: Analysis }) {
  const v = verdict(a)
  const t = TONE[v.tone]
  return (
    <div role="status" className={cn('bg-card flex gap-4 rounded-xl border border-l-4 p-4 sm:p-5', t.bar)}>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', t.chip)} aria-hidden>
        <t.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xl leading-snug font-semibold text-balance sm:text-2xl">{v.title}</p>
        <p className="text-foreground/80 mt-1 text-base text-pretty">{v.text}</p>
        {a.recommendations.length > 0 && (
          <a href="#rekomendacje" className="no-print text-primary mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline">
            Co możesz zrobić ({a.recommendations.length}) <ArrowDown className="size-3.5" aria-hidden />
          </a>
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
                <Tooltip key={p.period}>
                <TooltipTrigger
                  render={<td />}
                  className={cn(
                    'h-6 min-w-6 rounded-sm text-center',
                    p.drought === true && 'bg-status-critical font-bold text-white',
                    p.drought === false && 'bg-emerald-100 dark:bg-emerald-900/35',
                    p.drought === null && 'bg-muted',
                  )}
                >
                  {p.drought === true ? '!' : ''}
                </TooltipTrigger>
                <TooltipContent>
                  <span>
                    <strong>
                      {y.year}, {p.period}
                    </strong>
                    <br />
                    bilans wodny {mm(p.kbw)}
                    {typeof p.threshold === 'number' ? ` · próg suszy ${thr(p.threshold)}` : ' · brak progu w tym okresie'}
                  </span>
                </TooltipContent>
                </Tooltip>
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
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_190px]">
      <div className="grid gap-4">
      <section id="ocena" data-section className="grid gap-4">
      <StatusBanner a={a} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Bilans wodny, ostatnie 60 dni"
          value={mm(w.kbw)}
          hint={w.median_hist !== null ? `mediana z 10 lat: ${mm(w.median_hist)}` : undefined}
        />
        <KpiCard
          label="Na tle ostatnich 10 lat"
          value={w.percentile === null ? '–' : w.percentile <= 10 ? 'bardzo sucho' : w.percentile <= 30 ? 'sucho' : w.percentile < 70 ? 'typowo' : 'wilgotno'}
          hint={
            w.percentile === null
              ? undefined
              : w.percentile === 0
                ? 'najsuchsze 60 dni w tym terminie od 10 lat'
                : `suchsze niż ${100 - w.percentile}% lat`
          }
        />
        <KpiCard
          label="Lata z suszą"
          value={a.history.years_total ? `${a.history.years_with_drought} / ${a.history.years_total}` : '–'}
          hint={worst && worst.share > 0 ? `najczęściej w okresie ${worst.period}` : undefined}
        />
        <KpiCard
          label="Gleba (IUNG)"
          value={a.soil.category ? `kat. ${a.soil.category}` : a.soil.code === 5 ? 'organiczna' : '–'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bilans wodny w {new Date(a.analysis_date).getFullYear()} r.</CardTitle>
          <CardDescription>
            Opad minus parowanie w oknie 60 dni, w mm (metoda IUNG).
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
            <CardTitle>Historia suszy, 10 lat</CardTitle>
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
            Wiarygodność i źródła
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
        </CardContent>
      </Card>
      </div>
      <ReportOutline items={SECTIONS.filter((x) => x.id !== 'historia' || a.history.years.length > 0)} />
    </div>
  )
}
