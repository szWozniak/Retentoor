import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react'
import type { LandUse } from '@/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

/** Shows whether the selected parcel is agricultural. Never blocks the analysis – only warns. */
export function LandUseNotice({ landuse }: { landuse: LandUse }) {
  const Icon = landuse.class === 'rolna' ? CheckCircle2 : landuse.class === 'nieznana' ? CircleHelp : AlertTriangle
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
    <Alert
      className={cn(
        landuse.class === 'rolna' && '*:[svg]:text-success',
        landuse.class === 'mieszana' && 'border-transparent bg-warning-container text-on-warning-container',
        landuse.class === 'nierolna' && 'border-transparent bg-error-container text-on-error-container',
      )}
    >
      <Icon aria-hidden />
      <AlertTitle>
        {landuse.label}
        {landuse.agricultural_share !== null && landuse.class !== 'rolna' && (
          <span className="text-muted-foreground font-normal"> · {Math.round(landuse.agricultural_share * 100)}% rolna</span>
        )}
      </AlertTitle>
      {(text || parts) && (
        <AlertDescription>
          {text && <p>{text}</p>}
          {parts && <p className="text-xs">{parts}</p>}
        </AlertDescription>
      )}
    </Alert>
  )
}
