import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Loader2, LocateFixed, MapPin, Star } from 'lucide-react'
import { api, type Analysis, type Crop, type Parcel } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/DatePicker'
import { ParcelMap } from '@/components/map/ParcelMap'
import { LandUseNotice } from '@/components/map/LandUseNotice'
import { PlaceSearch } from '@/components/map/PlaceSearch'
import { AnalysisResult } from '@/components/analysis/AnalysisResult'
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress'
import { ReportHeader } from '@/components/analysis/ReportHeader'
import { formatNumber } from '@/lib/format'
import { useSavedFields } from '@/lib/fields'
import { cn } from '@/lib/utils'

const todayIso = () => new Date().toISOString().slice(0, 10)
const minDateIso = () => `${new Date().getFullYear() - 10}-01-01`

/** Real parcels from different regions – handy for the demo and for trying the tool. */
const SAMPLES = [
  { id: '200807_2.0012.162', label: 'Trzcianne', hint: 'podlaskie · gleba lekka' },
  { id: '260104_5.0016.78', label: 'Pacanów', hint: 'świętokrzyskie · gleba ciężka' },
  { id: '302111_5.0016.1/10', label: 'Murowana Goślina', hint: 'wielkopolskie · gleby mieszane' },
  { id: '100206_2.0008.273/23', label: 'Kutno', hint: 'łódzkie' },
]

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function StepTitle({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors',
          done ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}
        aria-hidden
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      {children}
      {done && <span className="sr-only">(gotowe)</span>}
    </CardTitle>
  )
}

function Intro() {
  return (
    <section className="animate-fade-up">
      <h1 className="type-headline text-balance sm:type-display">Sprawdź, jak zatrzymać wodę na swoim polu</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl text-pretty">
        Łączy dane pogodowe z 10 lat, mapy glebowe, ukształtowanie terenu i dane hydrologiczne. Pokazuje, czy działce grozi susza i co możesz
        zrobić.
      </p>
    </section>
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
  const [focus, setFocus] = useState<{ lat: number; lon: number; t: number; zoom?: number } | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const { fields, save, remove, isSaved, setCrop: rememberCrop } = useSavedFields()
  const [userPos, setUserPos] = useState<{ lat: number; lon: number; accuracy: number } | null>(null)
  const [locating, setLocating] = useState(false)

  /** Farmers often check a field while standing on it: show where they are and offer the parcel under them. */
  const locate = () => {
    if (!navigator.geolocation) return toast.error('Ta przeglądarka nie udostępnia lokalizacji.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude: lat, longitude: lon, accuracy } = pos.coords
        setUserPos({ lat, lon, accuracy })
        setFocus({ lat, lon, zoom: 17, t: Date.now() })
        toast.success('Jesteś tutaj', {
          description: 'Kliknij swoje pole na mapie albo wybierz działkę, na której stoisz.',
          action: { label: 'Działka pode mną', onClick: () => loadParcel(() => api.parcelAt(lat, lon)) },
          duration: 10000,
        })
      },
      (err) => {
        setLocating(false)
        toast.error(err.code === err.PERMISSION_DENIED ? 'Brak zgody na lokalizację. Włącz ją w ustawieniach przeglądarki.' : 'Nie udało się ustalić lokalizacji.')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

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
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    try {
      const a = await api.analyse(p.id, c, d)
      setAnalysis(a)
      rememberCrop(p.id, c)
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


  const showIntro = !parcel && !analysis && !analysing && !busy

  return (
    <div className="grid gap-6">
      {showIntro && (
        <div className="no-print">
          <Intro />
        </div>
      )}

      {/* mobile order: parcel → map → crop; desktop: controls left, map right */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr] lg:grid-rows-[auto_1fr] lg:gap-6 print:block">
        <Card className="no-print lg:col-start-1 lg:row-start-1">
          <CardHeader>
            <StepTitle n={1} done={!!parcel}>
              Wskaż działkę
            </StepTitle>
            <CardDescription>Albo kliknij swoje pole na mapie.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <PlaceSearch
              value={query}
              onChange={setQuery}
              busy={busy}
              onParcelId={(id) => loadParcel(() => api.parcelById(id))}
              onPlace={(p) => {
                setFocus({ lat: p.lat, lon: p.lon, zoom: p.zoom, t: Date.now() })
                toast.info(`${p.label}: teraz kliknij swoje pole na mapie`, { description: 'Granice działek pojawią się po przybliżeniu.' })
              }}
            />

            <Button type="button" variant="outline" className="h-10 w-full" onClick={locate} disabled={locating}>
              {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Moja lokalizacja
            </Button>

            {!parcel && fields.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1.5 text-sm">Moje pola:</p>
                <div className="flex flex-wrap gap-1.5">
                  {fields.slice(0, 6).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        loadParcel(() => api.parcelById(f.id)).then(() => {
                          if (f.crop) setCrop(f.crop)
                        })
                      }
                      className="hover:bg-foreground/8 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
                    >
                      <Star className="text-primary size-3.5 fill-current" aria-hidden /> {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!parcel && fields.length === 0 && (
              <div>
                <p className="text-muted-foreground mb-1.5 text-sm">Przykładowe działki:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      title={`${s.id} · ${s.hint}`}
                      onClick={() => loadParcel(() => api.parcelById(s.id))}
                      className="hover:bg-foreground/8 rounded-full border px-3 py-1.5 text-sm transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {parcel && (
              <div className="animate-fade-up rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-base font-semibold">
                    <MapPin className="text-primary size-4 shrink-0" aria-hidden /> Działka {parcel.number}, obręb {parcel.region}
                  </p>
                  <Button
                    type="button"
                    variant={isSaved(parcel.id) ? 'secondary' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (isSaved(parcel.id)) {
                        remove(parcel.id)
                        toast('Usunięto z Moich pól')
                      } else {
                        save(parcel, crop || undefined)
                        toast.success('Zapisano w Moich polach', { description: 'Nazwę możesz zmienić w zakładce Moje pola.' })
                      }
                    }}
                    aria-pressed={isSaved(parcel.id)}
                  >
                    <Star className={isSaved(parcel.id) ? 'text-primary fill-current' : ''} />
                    {isSaved(parcel.id) ? 'Zapisane' : 'Zapisz pole'}
                  </Button>
                </div>
                <p className="text-muted-foreground mb-1 font-mono text-xs break-all">{parcel.id}</p>
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

        <ParcelMap
          parcel={parcel}
          markers={analysis?.recommendations.filter((r) => r.location).map((r) => ({ ...r.location! }))}
          focus={focus}
          userPos={userPos}
          onLocate={locate}
          locating={locating}
          busy={busy}
          onPick={(lat, lon) => loadParcel(() => api.parcelAt(lat, lon))}
          className="print-map h-[48vh] min-h-[340px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-[560px]"
        />

        <Card className="no-print lg:col-start-1 lg:row-start-2 lg:self-start">
          <CardHeader>
            <StepTitle n={2} done={!!analysis}>
              Uprawa i data
            </StepTitle>
            <CardDescription>Dowolny dzień z ostatnich 10 lat.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                runAnalysis()
              }}
            >
              <div className="grid gap-1.5 text-sm">
                <span className="font-medium" id="crop-label">
                  Uprawa
                </span>
                <Select
                  value={crop || null}
                  onValueChange={(v) => setCrop((v as string) ?? '')}
                  items={crops.map((c) => ({ value: c.id, label: c.name }))}
                >
                  <SelectTrigger className="h-10 w-full" aria-labelledby="crop-label">
                    <SelectValue placeholder="Wybierz uprawę…" />
                  </SelectTrigger>
                  <SelectContent>
                    {crops.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 text-sm">
                <label className="font-medium" htmlFor="analysis-date">
                  Stan na dzień
                </label>
                <DatePicker id="analysis-date" value={date} min={minDateIso()} max={todayIso()} onChange={setDate} />
              </div>
              <Button type="submit" size="lg" className="h-11 text-base" disabled={!parcel || !crop || analysing}>
                {analysing ? (
                  <>
                    <Loader2 className="animate-spin" /> Analizuję…
                  </>
                ) : parcel?.landuse?.class === 'nierolna' ? (
                  'Analizuj mimo to'
                ) : (
                  'Analizuj działkę'
                )}
              </Button>
              {!parcel && <p className="text-muted-foreground text-center text-xs">Najpierw wskaż działkę.</p>}
            </form>
          </CardContent>
        </Card>
      </div>

      <div ref={resultsRef} className="grid scroll-mt-4 gap-4">
        {analysing && <AnalysisProgress />}
        {analysis && (
          <div className="animate-fade-up grid gap-4">
            <ReportHeader a={analysis} />
            <AnalysisResult
              a={analysis}
              onLocate={(lat, lon) => {
                setFocus({ lat, lon, t: Date.now() })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
