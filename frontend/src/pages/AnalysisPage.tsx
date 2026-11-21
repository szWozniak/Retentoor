import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, MapPin, Search } from 'lucide-react'
import { api, type Analysis, type Crop, type Parcel } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ParcelMap } from '@/components/map/ParcelMap'
import { LandUseNotice } from '@/components/map/LandUseNotice'
import { AnalysisResult } from '@/components/analysis/AnalysisResult'
import { ReportHeader } from '@/components/analysis/ReportHeader'
import { KpiSkeleton, ChartSkeleton } from '@/components/skeletons'
import { formatNumber } from '@/lib/format'

const todayIso = () => new Date().toISOString().slice(0, 10)
const minDateIso = () => `${new Date().getFullYear() - 10}-01-01`

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export default function AnalysisPage() {
  const [params, setParams] = useSearchParams()
  const [parcel, setParcel] = useState<Parcel | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [crops, setCrops] = useState<Crop[]>([])
  const [crop, setCrop] = useState(params.get('uprawa') ?? '')
  const [date, setDate] = useState(params.get('data') ?? todayIso())
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [focus, setFocus] = useState<{ lat: number; lon: number; t: number } | null>(null)

  useEffect(() => {
    api.crops().then(setCrops).catch(() => toast.error('Nie udało się pobrać listy upraw'))
  }, [])

  const syncUrl = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true }) // shareable link: /?dzialka=..&uprawa=..&data=..
  }

  const loadParcel = async (fn: () => Promise<Parcel>) => {
    setBusy(true)
    try {
      const p = await fn()
      setParcel(p)
      setQuery(p.id)
      setAnalysis(null)
      syncUrl({ dzialka: p.id })
      return p
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się pobrać działki')
    } finally {
      setBusy(false)
    }
  }

  const runAnalysis = async (p: Parcel | null = parcel, c = crop, d = date) => {
    if (!p) return toast.warning('Najpierw wskaż działkę')
    if (!c) return toast.warning('Wybierz uprawę')
    setAnalysing(true)
    setAnalysis(null)
    syncUrl({ dzialka: p.id, uprawa: c, data: d })
    try {
      const a = await api.analyse(p.id, c, d)
      setAnalysis(a)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analiza nie powiodła się')
    } finally {
      setAnalysing(false)
    }
  }

  // deep link: /?dzialka=ID[&uprawa=..&data=..] -> load parcel (and run analysis if crop given)
  useEffect(() => {
    const id = params.get('dzialka')
    if (!id) return
    loadParcel(() => api.parcelById(id)).then((p) => {
      if (p && params.get('uprawa')) runAnalysis(p, params.get('uprawa')!, params.get('data') ?? todayIso())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return toast.warning('Wpisz numer działki, np. 260104_5.0016.78')
    loadParcel(() => api.parcelById(query))
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr] print:block">
        <div className="no-print grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Wskaż działkę</CardTitle>
              <CardDescription>Wpisz numer działki ewidencyjnej albo kliknij swoje pole na mapie.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <form onSubmit={onSearch} className="flex gap-2">
                <Input placeholder="np. 260104_5.0016.78" aria-label="Numer działki ewidencyjnej" value={query} onChange={(e) => setQuery(e.target.value)} />
                <Button type="submit" disabled={busy} aria-label="Szukaj działki">
                  {busy ? <Loader2 className="animate-spin" /> : <Search />}
                </Button>
              </form>
              {parcel && (
                <div className="rounded-lg border p-3">
                  <p className="flex items-center gap-1.5 font-medium">
                    <MapPin className="size-4" /> Działka {parcel.number}, obręb {parcel.region}
                  </p>
                  <p className="text-muted-foreground mb-1 text-xs break-all">{parcel.id}</p>
                  <Row label="Powierzchnia" value={`${formatNumber(Math.round(parcel.area_ha * 100) / 100)} ha`} />
                  <Row label="Gmina" value={`${parcel.commune} (${parcel.county})`} />
                  <Row label="Województwo" value={parcel.voivodeship} />
                  {parcel.landuse && (
                    <div className="mt-2">
                      <LandUseNotice landuse={parcel.landuse} />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Uprawa i data</CardTitle>
              <CardDescription>Wybierz uprawę, dla której chcesz ocenić ryzyko suszy.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  runAnalysis()
                }}
              >
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Uprawa</span>
                  <select
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    value={crop}
                    onChange={(e) => setCrop(e.target.value)}
                  >
                    <option value="">– wybierz –</option>
                    {crops.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Data analizy</span>
                  <Input type="date" value={date} min={minDateIso()} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
                </label>
                <Button type="submit" size="lg" disabled={!parcel || !crop || analysing}>
                  {analysing ? (
                    <>
                      <Loader2 className="animate-spin" /> Analizuję dane z 10 lat…
                    </>
                  ) : parcel?.landuse?.class === 'nierolna' ? (
                    'Analizuj mimo to'
                  ) : (
                    'Analizuj działkę'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <ParcelMap
          parcel={parcel}
          markers={analysis?.recommendations.filter((r) => r.location).map((r) => ({ ...r.location! }))}
          focus={focus}
          busy={busy}
          onPick={(lat, lon) => loadParcel(() => api.parcelAt(lat, lon))}
          className="print-map h-[55vh] min-h-[400px]"
        />
      </div>

      {analysing && (
        <div className="grid gap-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <KpiSkeleton key={i} />)}
          </div>
          <Card>
            <CardContent className="pt-6">
              <ChartSkeleton height={280} />
            </CardContent>
          </Card>
        </div>
      )}
      {analysis && <ReportHeader a={analysis} />}
      {analysis && (
        <AnalysisResult
          a={analysis}
          onLocate={(lat, lon) => {
            setFocus({ lat, lon, t: Date.now() })
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}
    </div>
  )
}
