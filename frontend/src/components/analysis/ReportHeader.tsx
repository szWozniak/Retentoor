import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Printer } from 'lucide-react'
import type { Analysis } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/format'
import { Logo } from '@/components/Logo'

/** Link that recomputes the same report (parcel + crop + date) – nothing is stored on the server. */
const reportLink = (a: Analysis) =>
  `${window.location.origin}/raport?dzialka=${encodeURIComponent(a.parcel.id)}&uprawa=${a.crop.id}&data=${a.analysis_date}`

/** Title block of the report + actions (print/PDF, copy link). Actions are hidden in print. */
export function ReportHeader({ a }: { a: Analysis }) {
  const [generatedAt] = useState(() => new Date().toISOString())
  const link = reportLink(a)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link do raportu skopiowany', { description: 'Otwarcie linku przelicza raport z aktualnymi danymi.' })
    } catch {
      toast.info(link)
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
      {/* PDF / print: brand at the top of the page (the app header is hidden in print) */}
      <div className="print-block mb-2 w-full">
        <Logo />
      </div>
      <div>
        <h2 className="type-title">
          Działka {a.parcel.number}, obręb {a.parcel.region} · {a.crop.name}
        </h2>
        <p className="text-muted-foreground text-sm">
          {a.parcel.id} · gm. {a.parcel.commune}, {a.parcel.voivodeship} · {a.parcel.area_ha.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ha · stan na{' '}
          <strong>{formatDate(a.analysis_date)}</strong>
          {a.mode === 'wsteczna' && <Badge variant="secondary" className="ml-2 align-middle">analiza wsteczna</Badge>}
          {a.mode === 'prognoza' && <Badge variant="warning" className="ml-2 align-middle">prognoza</Badge>}
        </p>
        {a.mode !== 'biezaca' && <ModeNote a={a} />}
        <p className="text-muted-foreground text-xs">
          Wygenerowano {formatDateTime(generatedAt)}
          <span className="print-only"> · {link}</span>
        </p>
      </div>
      <div className="no-print flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Drukuj / PDF
        </Button>
        <Button variant="outline" onClick={copy}>
          <Link2 /> Kopiuj link do raportu
        </Button>
      </div>
    </div>
  )
}

/** One sentence that says how to read a report for a past or a future date. */
function ModeNote({ a }: { a: Analysis }) {
  if (a.mode === 'wsteczna')
    return (
      <p className="mt-1 text-sm">
        To ocena wsteczna: pokazuje sytuację wodną z {formatDate(a.analysis_date)} i to, co wtedy byłoby zasadne. Działania retencyjne są aktualne także
        dziś.
      </p>
    )
  const fc = a.forecast_span
  return (
    <p className="mt-1 text-sm">
      Ocena na przyszły dzień{fc ? `: pogoda od ${formatDate(fc.from)} do ${formatDate(fc.to)} to ${fc.label}, a nie pomiar` : ''}. Im dalej od
      dziś, tym mniej pewna – sprawdź raport ponownie bliżej tej daty.
    </p>
  )
}
