import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { AnalysisResult } from '@/components/analysis/AnalysisResult'
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress'
import { ReportHeader } from '@/components/analysis/ReportHeader'
import { ParcelMap } from '@/components/map/ParcelMap'
import { ErrorState } from '@/components/EmptyState'

/**
 * Shared report: /raport?dzialka=ID&uprawa=CROP&data=YYYY-MM-DD.
 * Nothing is stored on the server – the link recomputes the analysis (external data is cached, so it is quick).
 */
export default function ReportPage() {
  const [params] = useSearchParams()
  const parcelId = params.get('dzialka') ?? ''
  const crop = params.get('uprawa') ?? ''
  const date = params.get('data') ?? new Date().toISOString().slice(0, 10)
  const { data: a, loading, error, reload } = useAsync(() => api.analyse(parcelId, crop, date), [parcelId, crop, date])
  const [focus, setFocus] = useState<{ lat: number; lon: number; t: number } | null>(null)

  if (!parcelId || !crop) return <ErrorState message="Link do raportu jest niepełny (brak działki lub uprawy)." />
  if (loading) return <AnalysisProgress />
  if (error || !a) return <ErrorState message={error ?? 'Nie udało się przygotować raportu'} onRetry={reload} />

  return (
    <div className="report grid gap-4">
      <ReportHeader a={a} />
      <ParcelMap
        parcel={a.parcel}
        markers={a.recommendations.filter((r) => r.location).map((r) => ({ ...r.location! }))}
        focus={focus}
        onPick={() => {}}
        className="print-map h-[320px]"
      />
      <AnalysisResult a={a} onLocate={(lat, lon) => setFocus({ lat, lon, t: Date.now() })} />
      <p className="no-print text-muted-foreground text-sm">
        <Link className="underline" to={`/?dzialka=${encodeURIComponent(a.parcel.id)}&uprawa=${a.crop.id}&data=${a.analysis_date}`}>
          Zmień uprawę lub datę
        </Link>
      </p>
    </div>
  )
}
