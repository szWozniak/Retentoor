import { useCallback, useSyncExternalStore } from 'react'
import type { Parcel } from '@/api'

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
}

const KEY = 'zatrzymaj-wode.fields'
const listeners = new Set<() => void>()
let cache: SavedField[] | null = null

function read(): SavedField[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedField[]
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
    }
    write([field, ...read().filter((f) => f.id !== p.id)])
  }, [])

  const remove = useCallback((id: string) => write(read().filter((f) => f.id !== id)), [])
  const rename = useCallback((id: string, name: string) => write(read().map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f))), [])
  const setCrop = useCallback((id: string, crop: string) => {
    if (read().some((f) => f.id === id)) write(read().map((f) => (f.id === id ? { ...f, crop } : f)))
  }, [])
  const isSaved = useCallback((id: string | undefined) => !!id && fields.some((f) => f.id === id), [fields])

  return { fields, save, remove, rename, setCrop, isSaved }
}
