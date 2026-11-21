import { AlertTriangle, CheckCircle2, CircleHelp, CircleMinus, FileWarning, MapPin } from 'lucide-react'
import type { Analysis, Cause, Recommendation } from '@/api'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const CAUSE_STYLE: Record<Cause['status'], { icon: typeof CheckCircle2; cls: string; label: string }> = {
  tak: { icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400', label: 'główna przyczyna' },
  częściowo: { icon: CircleMinus, cls: 'text-amber-600 dark:text-amber-400', label: 'częściowo' },
  nie: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', label: 'nie stwierdzono' },
  'brak danych': { icon: CircleHelp, cls: 'text-muted-foreground', label: 'brak danych' },
}

export function CausesSection({ a }: { a: Analysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Przyczyny</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {a.causes.map((c) => {
          const st = CAUSE_STYLE[c.status]
          return (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">
                  <st.icon className={cn('size-4 shrink-0', st.cls)} aria-hidden /> {c.title}
                </p>
                <span className={cn('shrink-0 text-xs font-medium', st.cls)}>{st.label}</span>
              </div>
              <ul className="text-foreground/80 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {c.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

const STAGES: { id: Recommendation['stage']; title: string }[] = [
  { id: 'retencja_krajobrazowa', title: '1. Zatrzymaj wodę w krajobrazie' },
  { id: 'retencja_glebowa', title: '2. Zwiększ retencję gleby' },
  { id: 'agrotechnika', title: '3. Działania agrotechniczne' },
  { id: 'nawadnianie', title: '4. Nawadnianie' },
]

const PRIO: Record<Recommendation['priority'], 'default' | 'secondary' | 'outline'> = { wysoki: 'default', średni: 'secondary', niski: 'outline' }

function RecItem({ r, onLocate }: { r: Recommendation; onLocate?: (lat: number, lon: number) => void }) {
  return (
    <div className={cn('bg-card rounded-lg border p-3', r.priority === 'wysoki' && 'border-primary/40 ring-primary/10 ring-1')}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold">{r.title}</p>
        <Badge variant={PRIO[r.priority]}>{r.priority === 'wysoki' ? 'zrób w pierwszej kolejności' : `priorytet: ${r.priority}`}</Badge>
      </div>
      <p className="text-[15px] leading-relaxed">{r.action}</p>
      {/* print/PDF: justification always visible */}
      <ul className="print-block text-muted-foreground mt-2 list-disc space-y-0.5 pl-5 text-xs">
        {r.why.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <Accordion className="no-print mt-1">
        <AccordionItem value="why" className="border-none">
          <AccordionTrigger className="text-primary py-1.5 text-xs">Dlaczego? ({r.why.length})</AccordionTrigger>
          <AccordionContent keepMounted className="pb-1">
            <ul className="text-muted-foreground bg-muted/50 list-disc space-y-0.5 rounded-md py-2 pr-2 pl-6 text-xs">
              {r.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>Podstawa: {r.basis.join(' · ')}</span>
        {r.location && onLocate && (
          <button className="no-print text-primary flex items-center gap-1 underline underline-offset-2" onClick={() => onLocate(r.location!.lat, r.location!.lon)}>
            <MapPin className="size-3" /> pokaż na mapie
          </button>
        )}
      </div>
      {r.permit && (
        <p className="mt-2 flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <FileWarning className="mt-0.5 size-3.5 shrink-0" /> {r.permit}
        </p>
      )}
    </div>
  )
}

export function RecommendationsSection({ a, onLocate }: { a: Analysis; onLocate?: (lat: number, lon: number) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Co możesz zrobić</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {STAGES.map((s) => {
          const items = a.recommendations.filter((r) => r.stage === s.id)
          return (
            <section key={s.id}>
              <h3 className="mb-2 text-base font-semibold">{s.title}</h3>
              {items.length ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {items.map((r) => (
                    <RecItem key={r.id} r={r} onLocate={onLocate} />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {s.id === 'nawadnianie' && a.irrigation?.decision === 'poza sezonem'
                    ? 'Uprawa poza okresem wegetacji w tym terminie – ocena nawadniania nie dotyczy.'
                    : 'Dane nie wskazują potrzeby działań.'}
                </p>
              )}
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function CropComparison({ a }: { a: Analysis }) {
  const rows = a.crop_comparison.filter((c) => c.suited && c.drought_years !== null)
  if (!rows.length) return null
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Porównanie upraw</CardTitle>
        <CardDescription>Sezony z suszą w ostatnich 10 latach, na tej samej glebie i pogodzie.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.crop} className={cn('grid grid-cols-[minmax(0,170px)_1fr_auto] items-center gap-3', r.crop === a.crop.id && 'font-semibold')}>
              <span className="truncate">{r.name}{r.crop === a.crop.id && ' (wybrana)'}</span>
              <span className="bg-muted h-2.5 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${((r.drought_years ?? 0) / max) * 100}%`, background: 'var(--status-critical)', minWidth: r.drought_years ? 6 : 0 }}
                />
              </span>
              <span className="text-muted-foreground tabular-nums">{r.drought_years}/{r.n}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
