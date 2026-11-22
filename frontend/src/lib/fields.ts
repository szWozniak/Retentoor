import { useCallback, useSyncExternalStore } from 'react'
import type { Analysis, Irrigation, Parcel } from '@/api'

/**
 * "Moje pola" – the farmer's saved parcels. Stored only in this browser (localStorage):
 * no accounts and no personal data on the server.
 */
export type SavedField = {
  id: string // parcel ID (TERYT)
  name: string // farmer's own name, e.g. "Za stodołą"
  number: string
  region: string // obręb
  commune: string
  voivodeship: string
  area_ha: number
  centroid: [number, number]
  crop?: string // last analysed crop
  savedAt: string
  county?: string
  /** parcel outline for the "all my fields" map (older entries get it filled in lazily) */
  geometry?: Parcel['geometry']
  /** short result of the latest analysis of this field, kept so the list can show the state without recomputing */
  last?: FieldCheck
}

export type FieldCheck = {
  checkedAt: string
  date: string
  mode: Analysis['mode']
  crop: string
  cropName: string
  kbw: number | null
  percentile: number | null
  drought: boolean | null
  inSeason: boolean
  irrigation: Irrigation['decision'] | null
  droughtYears: number
  yearsTotal: number
  worstPeriod: string | null
  soil: string
  awcMm: number | null
  slopePct: number | null
  confidence: Analysis['confidence']
  topAction: string | null
}

/** Field state for the list and the map. */
export type FieldStatus = 'susza' | 'uwaga' | 'ok' | 'poza sezonem' | 'nieznany'

export function fieldStatus(c?: FieldCheck): FieldStatus {
  if (!c) return 'nieznany'
  if (c.drought) return 'susza'
  if (c.percentile !== null && c.percentile <= 25) return 'uwaga'
  if (!c.inSeason) return 'poza sezonem'
  return 'ok'
}

export function summarise(a: Analysis): FieldCheck {
  const w = a.current.window
  const worst = [...a.history.period_frequency].sort((x, y) => y.share - x.share)[0]
  return {
    checkedAt: new Date().toISOString(),
    date: a.analysis_date,
    mode: a.mode,
    crop: a.crop.id,
    cropName: a.crop.name,
    kbw: w.kbw,
    percentile: w.percentile,
    drought: a.current.last_period?.drought ?? null,
    inSeason: a.current.in_season,
    irrigation: a.irrigation?.decision ?? null,
    droughtYears: a.history.years_with_drought,
    yearsTotal: a.history.years_total,
    worstPeriod: worst && worst.share > 0 ? worst.period : null,
    soil: a.soil.label,
    awcMm: a.soilgrids?.awc_mm_100 ?? null,
    slopePct: a.terrain?.slope_pct ?? null,
    confidence: a.confidence,
    topAction: a.recommendations.find((r) => r.priority === 'wysoki')?.title ?? a.recommendations[0]?.title ?? null,
  }
}

const KEY = 'retentoor.fields'
const OLD_KEY = 'zatrzymaj-wode.fields' // before the rename – read once and migrate
const listeners = new Set<() => void>()
let cache: SavedField[] | null = null

function read(): SavedField[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) ?? '[]') as SavedField[]
  } catch {
    cache = []
  }
  return cache
}

function write(next: SavedField[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full or blocked – keep in memory for this session */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null
      l()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSavedFields() {
  const fields = useSyncExternalStore(subscribe, read, () => [])

  const save = useCallback((p: Parcel, crop?: string) => {
    const existing = read().find((f) => f.id === p.id)
    const field: SavedField = {
      id: p.id,
      name: existing?.name ?? `Działka ${p.number}, ${p.region}`,
      number: p.number,
      region: p.region,
      commune: p.commune,
      voivodeship: p.voivodeship,
      area_ha: p.area_ha,
      centroid: p.centroid,
      crop: crop ?? existing?.crop,
      savedAt: existing?.savedAt ?? new Date().toISOString(),
      county: p.county,
      geometry: p.geometry,
      last: existing?.last,
    }
    write([field, ...read().filter((f) => f.id !== p.id)])
  }, [])

  const remove = useCallback((id: string) => write(read().filter((f) => f.id !== id)), [])
  /** undo a removal: put the field back where it was */
  const restore = useCallback((f: SavedField, index: number) => {
    const list = read().filter((x) => x.id !== f.id)
    list.splice(Math.min(index, list.length), 0, f)
    write(list)
  }, [])
  const rename = useCallback((id: string, name: string) => write(read().map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f))), [])
  const setCrop = useCallback((id: string, crop: string) => {
    if (read().some((f) => f.id === id)) write(read().map((f) => (f.id === id ? { ...f, crop } : f)))
  }, [])
  /** store the latest analysis of a saved field (ignored for parcels that are not saved) */
  const record = useCallback((a: Analysis) => {
    if (read().some((f) => f.id === a.parcel.id))
      write(
        read().map((f) =>
          f.id === a.parcel.id
            ? {
                ...f,
                crop: a.crop.id,
                geometry: f.geometry ?? a.parcel.geometry,
                county: a.parcel.county,
                last: summarise(a),
              }
            : f,
        ),
      )
  }, [])
  const setGeometry = useCallback((id: string, geometry: Parcel['geometry']) => {
    write(read().map((f) => (f.id === id ? { ...f, geometry } : f)))
  }, [])
  const isSaved = useCallback((id: string | undefined) => !!id && fields.some((f) => f.id === id), [fields])

  return {
    fields,
    save,
    remove,
    restore,
    rename,
    setCrop,
    record,
    setGeometry,
    isSaved,
  }
}
