import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Printer, Save } from 'lucide-react'
import type { Analysis } from '@/api'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/format'
import { Logo } from '@/components/Logo'

/** Title block of the report + actions (print/PDF, save in the system). Actions are hidden in print. */
export function ReportHeader({ a, savedId, createdAt }: { a: Analysis; savedId?: string; createdAt?: string }) {
  const [saving, setSaving] = useState(false)
  const [id, setId] = useState(savedId)
  const [generatedAt] = useState(() => createdAt ?? new Date().toISOString())

  const link = id ? `${window.location.origin}/raport/${id}` : null

  const copy = async (url: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(okMsg, { description: url })
    } catch {
      toast.info(url)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.saveReport(a.parcel.id, a.crop.id, a.analysis_date)
      setId(r.id)
      await copy(`${window.location.origin}/raport/${r.id}`, 'Raport zapisany – link skopiowany')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać raportu')
    } finally {
      setSaving(false)
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
          {link && <span className="print-only"> · {link}</span>}
        </p>
      </div>
      <div className="no-print flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Drukuj / PDF
        </Button>
        {id ? (
          <Button variant="outline" onClick={() => copy(link!, 'Link skopiowany')}>
            <Link2 /> Kopiuj link do raportu
          </Button>
        ) : (
          <Button onClick={save} disabled={saving}>
            <Save /> {saving ? 'Zapisuję…' : 'Zapisz raport'}
          </Button>
        )}
      </div>
    </div>
  )
}
