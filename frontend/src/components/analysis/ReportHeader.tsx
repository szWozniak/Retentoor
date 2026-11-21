import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Printer } from 'lucide-react'
import type { Analysis } from '@/api'
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
        </p>
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
