import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * What the backend does during an analysis (all sources are fetched in parallel; typically 5–15 s).
 * Steps advance on a timer – they describe the work, they don't track real per-source progress.
 */
const STEPS = [
  { at: 0, label: 'Granice działki i użytkowanie terenu', src: 'GUGiK ULDK, IUNG-PIB' },
  { at: 0.8, label: 'Kategoria gleby i skład gleby', src: 'IUNG-PIB, ISRIC SoilGrids' },
  { at: 1.6, label: 'Pogoda dzień po dniu z ostatnich 10 lat', src: 'Open-Meteo / NASA POWER' },
  { at: 3.5, label: 'Ukształtowanie terenu i otoczenie działki', src: 'GUGiK NMT, IUNG-PIB' },
  { at: 6, label: 'Bilans wodny i porównanie z progami suszy', src: 'metoda IUNG-PIB SMSR' },
  { at: 8, label: 'Przyczyny i rekomendacje', src: 'FAO-56, NWRM, CDR' },
]

export function AnalysisProgress() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const id = setInterval(() => setT((performance.now() - start) / 1000), 200)
    return () => clearInterval(id)
  }, [])
  const current = STEPS.reduce((acc, s, i) => (t >= s.at ? i : acc), 0)

  return (
    <Card className="animate-fade-up select-none" aria-live="polite" aria-busy="true">
      <CardContent className="grid gap-4 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-semibold">Analizuję działkę…</p>
          <p className="text-muted-foreground mb-3 text-sm">Zwykle trwa to 5–15 sekund.</p>
          <ol className="grid gap-1.5 text-sm">
            {STEPS.map((s, i) => (
              <li key={s.label} className={cn('flex items-center gap-2 transition-opacity', i > current && 'opacity-40')}>
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border',
                    i < current && 'bg-primary border-primary text-primary-foreground',
                    i === current && 'border-primary text-primary',
                  )}
                >
                  {i < current ? <Check className="size-3" /> : i === current ? <Loader2 className="size-3 animate-spin" /> : null}
                </span>
                <span>
                  {s.label}
                  <span className="text-outline ml-2 text-xs">{s.src}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-muted-foreground text-right text-3xl font-semibold tabular-nums">{t.toFixed(0)} s</p>
      </CardContent>
    </Card>
  )
}
