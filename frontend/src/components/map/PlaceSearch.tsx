import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Building2, Loader2, MapPin, Search } from 'lucide-react'
import { api, type Place } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Parcel IDs look like 260104_5.0016.78 (TERYT_type.obręb.number). */
export const looksLikeParcelId = (q: string) => /^\d{6}_\d\.\d{4}\./.test(q.trim())

type Props = {
  value: string
  onChange: (v: string) => void
  onParcelId: (id: string) => void
  onPlace: (p: Place) => void
  busy?: boolean
}

/**
 * One box for everything: a parcel ID (→ parcel lookup) or a town / address (→ suggestions, zoom the map).
 * Accessible combobox: arrow keys, Enter, Escape.
 */
export function PlaceSearch({ value, onChange, onParcelId, onPlace, busy }: Props) {
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const listId = useId()
  const reqId = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // suggestions while typing (GUGiK only – no Nominatim autocomplete, per its usage policy)
  useEffect(() => {
    const q = value.trim()
    if (q.length < 3 || looksLikeParcelId(q)) {
      setResults([])
      setSearched(false)
      return
    }
    const id = ++reqId.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.geocode(q)
        if (id === reqId.current) {
          setResults(r)
          setSearched(true)
          setActive(r.length ? 0 : -1)
        }
      } catch {
        /* ignore – user can press Enter */
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [value])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (p: Place) => {
    setOpen(false)
    onChange(p.label)
    onPlace(p)
  }

  const submit = async () => {
    const q = value.trim()
    if (!q) return
    if (looksLikeParcelId(q)) {
      setOpen(false)
      return onParcelId(q)
    }
    if (open && results[active]) return choose(results[active])
    // explicit search: may use the OpenStreetMap fallback
    setLoading(true)
    try {
      const r = await api.geocode(q, true)
      setResults(r)
      setSearched(true)
      setOpen(true)
      if (r.length === 1) choose(r[0])
      else setActive(r.length ? 0 : -1)
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const showList = open && value.trim().length >= 3 && !looksLikeParcelId(value) && (results.length > 0 || (searched && !loading))

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <Input
          className="h-10"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Numer działki, miejscowość lub adres"
          placeholder="Numer działki, miejscowość lub adres"
          value={value}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <Button type="button" size="icon" className="size-10 shrink-0" onClick={submit} disabled={busy} aria-label="Szukaj">
          {busy || loading ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground animate-fade-up absolute top-full right-12 left-0 z-[1200] mt-1 max-h-72 overflow-auto rounded-lg border p-1 shadow-lg"
        >
          {results.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-sm">Nie znaleziono. Spróbuj samej nazwy miejscowości albo kliknij pole na mapie.</li>
          )}
          {results.map((p, i) => {
            const Icon = p.kind === 'address' ? Building2 : MapPin
            return (
              <li
                key={`${p.lat},${p.lon},${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(p)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm', i === active && 'bg-accent text-accent-foreground')}
              >
                <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">{p.label}</span>
                  {p.sub && <span className="text-muted-foreground block truncate text-xs">{p.sub}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
