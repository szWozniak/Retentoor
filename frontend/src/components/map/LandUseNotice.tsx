import { AlertTriangle, CheckCircle2, CircleHelp, Loader2 } from 'lucide-react'
import type { LandUse } from '@/api'
import { cn } from '@/lib/utils'

/** Whether the selected parcel is agricultural – inline, no box. Never blocks the analysis, only warns. */
export function LandUseNotice({ landuse }: { landuse: LandUse | null }) {
  if (!landuse)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Sprawdzam użytkowanie terenu…
      </p>
    )

  const Icon = landuse.class === 'rolna' ? CheckCircle2 : landuse.class === 'nieznana' ? CircleHelp : AlertTriangle
  const tone = { rolna: 'text-success', mieszana: 'text-warning', nierolna: 'text-error', nieznana: 'text-muted-foreground' }[landuse.class]
  const text = {
    rolna: null,
    mieszana: 'Część działki to nie grunt rolny (np. zabudowa, zadrzewienie). Analiza dotyczy części rolnej.',
    nierolna: 'Według mapy IUNG to nie jest grunt rolny. Możesz uruchomić analizę, ale wynik dla upraw będzie tylko orientacyjny.',
    nieznana: 'Nie udało się sprawdzić użytkowania terenu.',
  }[landuse.class]
  const parts =
    landuse.parts.length > 1
      ? landuse.parts.map((p) => `${p.label.split('(')[0].split('–')[0].trim()} ${Math.round(p.share * 100)}%`).join(' · ')
      : null

  return (
    <div className="flex gap-2 text-sm">
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden />
      <div className="min-w-0">
        <p className={cn('font-bold', landuse.class !== 'rolna' && tone)}>
          {landuse.label}
          {landuse.agricultural_share !== null && landuse.class !== 'rolna' && (
            <span className="font-normal"> · {Math.round(landuse.agricultural_share * 100)}% rolna</span>
          )}
        </p>
        {text && <p className="text-muted-foreground">{text}</p>}
        {parts && <p className="text-muted-foreground text-xs">{parts}</p>}
      </div>
    </div>
  )
}
