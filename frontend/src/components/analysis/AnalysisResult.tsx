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

const mm = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)} mm`)

function StatusBanner({ a }: { a: Analysis }) {
  const lp = a.current.last_period
  const w = a.current.window
  let tone: 'bad' | 'warn' | 'ok' | 'unknown' = 'unknown'
  let title = 'Nie można jednoznacznie ocenić suszy'
  let text = ''

  if (lp && lp.drought) {
    tone = 'bad'
    title = 'Susza rolnicza dla tej uprawy'
    text = `W ostatnim zakończonym okresie (${lp.period}) bilans wodny wyniósł ${mm(lp.kbw)}, poniżej progu ${lp.threshold} mm dla ${a.crop.name.toLowerCase()} na glebie kat. ${a.soil.category_used}.`
  } else if (lp && lp.drought === false) {
    const close = lp.margin !== null && lp.margin < 30
    tone = close ? 'warn' : 'ok'
    title = close ? 'Blisko progu suszy' : 'Brak suszy rolniczej'
    text = `W ostatnim zakończonym okresie (${lp.period}) bilans wodny wyniósł ${mm(lp.kbw)} przy progu suszy ${lp.threshold} mm (zapas ${Math.round(lp.margin ?? 0)} mm).`
  } else if (w.kbw !== null) {
    text = !a.current.in_season
      ? `Data poza okresem monitoringu suszy IUNG (21.III–30.IX). Bilans wodny z ostatnich 60 dni: ${mm(w.kbw)}.`
      : `Dla tej uprawy w bieżącym okresie nie ma progu suszy (brak spadków plonu w tym czasie). Bilans z ostatnich 60 dni: ${mm(w.kbw)}.`
  }

  const Icon = tone === 'bad' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : CircleHelp
  return (
    <div
      role="status"
      className={cn(
        'flex gap-3 rounded-xl border p-4',
        tone === 'bad' && 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100',
        tone === 'warn' && 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        tone === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
        tone === 'unknown' && 'bg-muted',
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        {text && <p className="mt-1 text-sm">{text}</p>}
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
        <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `${v} mm`} />
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
                  title={`${y.year}, ${p.period}: KBW ${mm(p.kbw)}${typeof p.threshold === 'number' ? `, próg ${p.threshold} mm` : ''}`}
                  className={cn(
                    'h-6 min-w-6 rounded-sm text-center',
                    p.drought === true && 'bg-red-500 text-white',
                    p.drought === false && 'bg-emerald-100 dark:bg-emerald-900/40',
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
        <span className="mr-1 inline-block size-3 rounded-sm bg-red-500 align-middle" /> susza (KBW poniżej progu)
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
      <StatusBanner a={a} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <CardTitle>Bilans wodny w {new Date(a.analysis_date).getFullYear()} r.</CardTitle>
          <CardDescription>
            Opad minus parowanie w kroczącym oknie 60 dni (metoda IUNG). Im niżej, tym bardziej sucho. Romby to progi suszy dla wybranej uprawy i gleby.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KbwChart a={a} />
        </CardContent>
      </Card>

      {a.history.years.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historia suszy na tej działce (10 lat)</CardTitle>
            <CardDescription>Każda kratka to jeden 60-dniowy okres IUNG. Najedź, by zobaczyć wartości.</CardDescription>
          </CardHeader>
          <CardContent>
            <HistoryGrid a={a} />
          </CardContent>
        </Card>
      )}

      <CausesSection a={a} />
      <RecommendationsSection a={a} onLocate={onLocate} />
      <CropComparison a={a} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" /> Wiarygodność i źródła
            <Badge variant={a.confidence === 'wysoki' ? 'default' : a.confidence === 'średni' ? 'secondary' : 'destructive'}>
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
