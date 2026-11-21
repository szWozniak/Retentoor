import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { api, type Parcel } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { AnalysisResult } from '@/components/analysis/AnalysisResult'
import { ReportHeader } from '@/components/analysis/ReportHeader'
import { ParcelMap } from '@/components/map/ParcelMap'
import { ErrorState } from '@/components/EmptyState'
import { ChartSkeleton, KpiSkeleton } from '@/components/skeletons'

function landuseFromSoil(shares: { [code: string]: number }): Parcel['landuse'] {
  const entries = Object.entries(shares)
  if (!entries.length) return { class: 'nieznana', agricultural_share: null, label: 'Brak danych o użytkowaniu terenu', parts: [] }
  const agri = entries.reduce((sum, [c, v]) => (Number(c) >= 1 && Number(c) <= 5 ? sum + v : sum), 0)
  const cls = agri >= 0.8 ? 'rolna' : agri >= 0.2 ? 'mieszana' : 'nierolna'
  return { class: cls, agricultural_share: agri, label: cls === 'rolna' ? 'Działka rolna' : cls === 'mieszana' ? 'Działka częściowo rolna' : 'Działka nierolna', parts: [] }
}

/** A saved report snapshot: /raport/:id (read-only, exactly as generated). */
export default function ReportPage() {
  const { id = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => api.getReport(id), [id])
  const [focus, setFocus] = useState<{ lat: number; lon: number; t: number } | null>(null)

  if (loading)
    return (
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <KpiSkeleton key={i} />)}</div>
        <ChartSkeleton height={300} />
      </div>
    )
  if (error || !data) return <ErrorState message={error ?? 'Brak raportu'} onRetry={reload} />

  const a = data.analysis
  // older snapshots stored the parcel without the land-use class – derive it from the soil sample shares
  const parcel = a.parcel.landuse ? a.parcel : { ...a.parcel, landuse: landuseFromSoil(a.soil.shares) }
  return (
    <div className="report grid gap-4">
      <ReportHeader a={a} savedId={data.id} createdAt={data.created_at.endsWith('Z') ? data.created_at : `${data.created_at}Z`} />
      <ParcelMap
        parcel={parcel}
        markers={a.recommendations.filter((r) => r.location).map((r) => ({ ...r.location! }))}
        focus={focus}
        onPick={() => {}}
        className="print-map h-[320px]"
      />
      <AnalysisResult a={a} onLocate={(lat, lon) => setFocus({ lat, lon, t: Date.now() })} />
      <p className="no-print text-muted-foreground text-sm">
        To zapisany raport (migawka). <Link className="underline" to={`/?dzialka=${encodeURIComponent(a.parcel.id)}&uprawa=${a.crop.id}&data=${a.analysis_date}`}>Przelicz ponownie z aktualnymi danymi</Link>
      </p>
    </div>
  )
}
