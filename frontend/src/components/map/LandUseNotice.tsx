import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react'
import type { LandUse } from '@/api'
import { cn } from '@/lib/utils'
import { LANDUSE_COLORS } from './ParcelMap'

/** Shows whether the selected parcel is agricultural. Never blocks the analysis – only warns. */
export function LandUseNotice({ landuse }: { landuse: LandUse }) {
  const Icon = landuse.class === 'rolna' ? CheckCircle2 : landuse.class === 'nieznana' ? CircleHelp : AlertTriangle
  const text = {
    rolna: null,
    mieszana: 'Część działki to nie grunt rolny (np. zabudowa, zadrzewienie). Analiza dotyczy części rolnej.',
    nierolna: 'Według mapy IUNG to nie jest grunt rolny. Możesz uruchomić analizę, ale wynik dla upraw będzie tylko orientacyjny.',
    nieznana: 'Nie udało się sprawdzić użytkowania terenu.',
  }[landuse.class]

  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg border p-2.5 text-sm',
        landuse.class === 'nierolna' && 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100',
        landuse.class === 'mieszana' && 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: LANDUSE_COLORS[landuse.class] }} aria-hidden />
      <div className="grid gap-1">
        <p className="font-medium">
          {landuse.label}
          {landuse.agricultural_share !== null && landuse.class !== 'rolna' && (
            <span className="font-normal"> · {Math.round(landuse.agricultural_share * 100)}% rolna</span>
          )}
        </p>
        {text && <p className="text-xs opacity-90">{text}</p>}
        {landuse.parts.length > 1 && (
          <p className="text-xs opacity-75">
            {landuse.parts.map((p) => `${p.label.split('(')[0].split('–')[0].trim()} ${Math.round(p.share * 100)}%`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
