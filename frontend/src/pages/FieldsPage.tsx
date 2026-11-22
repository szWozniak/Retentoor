import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Download, FileText, Loader2, MapPin, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, type Crop } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { toIso } from '@/components/DatePicker'
import { FieldsMap, STATUS_STYLE } from '@/components/fields/FieldsMap'
import { fieldStatus, useSavedFields, type FieldStatus, type SavedField } from '@/lib/fields'
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

const ha = (v: number) => `${formatNumber(Math.round(v * 100) / 100)} ha`
const mm = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(v)))} mm`

const STATUS_BADGE: Record<FieldStatus, 'error' | 'warning' | 'success' | 'outline' | 'secondary'> = {
  susza: 'error',
  uwaga: 'warning',
  ok: 'success',
  'poza sezonem': 'secondary',
  nieznany: 'outline',
}
const IRRIGATION: Record<string, string> = {
  zasadne: 'zasadne',
  niezasadne: 'niepotrzebne',
  'wstrzymaj się': 'wstrzymaj się',
  'poza sezonem': 'poza sezonem',
}
const CONFIDENCE = { wysoki: 'wysoka', średni: 'średnia', niski: 'niska' } as const
/** where the current 60-day balance sits among the same dates of the last 10 years, in words */
function percentileText(p: number | null) {
  if (p === null) return undefined
  const v = Math.round(p)
  if (v <= 0) return 'najsuszej od 10 lat'
  if (v >= 100) return 'najwilgotniej od 10 lat'
  return v < 50 ? `suszej niż w ${100 - v}% lat` : `wilgotniej niż w ${v}% lat`
}
/** worst first, so "Wymagają uwagi" sorts naturally */
const STATUS_ORDER: FieldStatus[] = ['susza', 'uwaga', 'ok', 'poza sezonem', 'nieznany']

type Filter = 'wszystkie' | 'uwaga' | 'niesprawdzone'

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">
        {value}
        {hint && <span className="text-muted-foreground block text-xs font-normal">{hint}</span>}
      </span>
    </div>
  )
}

function FieldCard({
  f,
  index,
  cropName,
  selected,
  checking,
  onSelect,
  onCheck,
}: {
  f: SavedField
  index: number
  cropName?: string
  selected: boolean
  checking: boolean
  onSelect: () => void
  onCheck: () => void
}) {
  const { rename, remove, restore } = useSavedFields()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(f.name)
  const ref = useRef<HTMLDivElement>(null)
  const c = f.last
  const status = fieldStatus(c)
  const analyseUrl = `/?dzialka=${encodeURIComponent(f.id)}${f.crop ? `&uprawa=${f.crop}` : ''}`
  const reportUrl = c ? `/raport?dzialka=${encodeURIComponent(f.id)}&uprawa=${c.crop}&data=${c.date}` : null

  // the map picked this field: bring its card into view
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected])

  return (
    <div ref={ref} className="scroll-mt-4">
      <Card className={cn('transition-shadow', selected && 'ring-primary ring-2')}>
        <CardContent className="grid gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-2 size-3 shrink-0 rounded-full" style={{ background: STATUS_STYLE[status].stroke }} aria-hidden />
            <div className="min-w-0 flex-1">
              {editing ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    rename(f.id, name)
                    setEditing(false)
                  }}
                >
                  <Input className="h-9 max-w-xs" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Nazwa pola" />
                  <Button type="submit" size="icon" className="size-9" aria-label="Zapisz nazwę">
                    <Check />
                  </Button>
                </form>
              ) : (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button type="button" onClick={onSelect} className="text-left text-lg font-semibold hover:underline">
                    {f.name}
                  </button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(true)} aria-label={`Zmień nazwę: ${f.name}`}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Badge variant={STATUS_BADGE[status]}>{STATUS_STYLE[status].label}</Badge>
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                {f.commune}
                {f.county ? `, ${f.county.replace(/^powiat\s+/i, 'pow. ')}` : ''}, {f.voivodeship} · {ha(f.area_ha)}
              </p>
              <p className="text-muted-foreground font-mono text-xs break-all">{f.id}</p>
            </div>
          </div>

          {c ? (
            <>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Detail label="Uprawa" value={c.cropName} />
                <Detail
                  label="Sprawdzono"
                  value={formatDate(c.date)}
                  hint={c.mode === 'wsteczna' ? 'ocena wsteczna' : c.mode === 'prognoza' ? 'według prognozy' : formatRelative(c.checkedAt)}
                />
                <Detail
                  label="Bilans wodny (KBW)"
                  value={c.kbw === null ? '–' : mm(c.kbw)}
                  hint={percentileText(c.percentile)}
                />
                <Detail label="Nawadnianie" value={c.irrigation ? IRRIGATION[c.irrigation] : '–'} />
                <Detail
                  label="Susza w ostatnich latach"
                  value={c.yearsTotal ? `${c.droughtYears} z ${c.yearsTotal} sezonów` : '–'}
                  hint={c.worstPeriod ? `najczęściej ${c.worstPeriod}` : undefined}
                />
                <Detail label="Gleba" value={c.soil} hint={c.awcMm ? `ok. ${Math.round(c.awcMm)} mm wody dostępnej w 1 m` : undefined} />
                {c.slopePct !== null && <Detail label="Nachylenie" value={`${formatNumber(Math.round(c.slopePct * 10) / 10)}%`} />}
                <Detail label="Pewność oceny" value={CONFIDENCE[c.confidence]} />
              </div>
              {c.topAction && (
                <p className="bg-muted rounded-md px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Najważniejsze działanie: </span>
                  <span className="font-medium">{c.topAction}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              {cropName || f.crop
                ? 'To pole nie było jeszcze sprawdzane w tej przeglądarce. Kliknij „Sprawdź na dziś”.'
                : 'Wybierz uprawę i sprawdź pole, a tutaj pojawi się stan wody, ryzyko suszy i najważniejsze działanie.'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {f.crop ? (
              <Button size="sm" onClick={onCheck} disabled={checking}>
                {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sprawdź na dziś
              </Button>
            ) : (
              <Button size="sm" nativeButton={false} render={<Link to={analyseUrl} />}>
                Wybierz uprawę i sprawdź
              </Button>
            )}
            {reportUrl && (
              <Button size="sm" variant="outline" nativeButton={false} render={<Link to={reportUrl} />}>
                <FileText /> Pełny raport
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onSelect}>
              <MapPin /> Na mapie
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                remove(f.id)
                toast(`Usunięto „${f.name}”`, {
                  action: { label: 'Cofnij', onClick: () => restore(f, index) },
                })
              }}
              aria-label={`Usuń ${f.name}`}
            >
              <Trash2 /> <span className="sr-only sm:not-sr-only">Usuń</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="type-headline mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  )
}

/** CSV for the farmer's own records (Excel-friendly: semicolons, BOM, decimal comma). */
function downloadCsv(fields: SavedField[]) {
  const num = (v: number | null | undefined, nd = 0) => (v === null || v === undefined ? '' : v.toFixed(nd).replace('.', ','))
  const head = [
    'Nazwa',
    'Identyfikator działki',
    'Gmina',
    'Województwo',
    'Powierzchnia [ha]',
    'Uprawa',
    'Data oceny',
    'Stan',
    'KBW [mm]',
    'Percentyl',
    'Lata z suszą',
    'Gleba',
    'Pewność',
    'Najważniejsze działanie',
  ]
  const rows = fields.map((f) => {
    const c = f.last
    return [
      f.name,
      f.id,
      f.commune,
      f.voivodeship,
      num(f.area_ha, 2),
      c?.cropName ?? '',
      c?.date ?? '',
      STATUS_STYLE[fieldStatus(c)].label,
      num(c?.kbw),
      num(c?.percentile),
      c ? `${c.droughtYears}/${c.yearsTotal}` : '',
      c?.soil ?? '',
      c ? CONFIDENCE[c.confidence] : '',
      c?.topAction ?? '',
    ]
  })
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `moje-pola-${toIso(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FieldsPage() {
  const { fields, record, setGeometry } = useSavedFields()
  const [crops, setCrops] = useState<Crop[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('wszystkie')
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    api
      .crops()
      .then(setCrops)
      .catch(() => {})
  }, [])

  // fields saved before outlines were stored: fetch their outline once (backend cache makes this cheap)
  useEffect(() => {
    const missing = fields.filter((f) => !f.geometry).map((f) => f.id)
    if (!missing.length) return
    let alive = true
    ;(async () => {
      for (const id of missing) {
        if (!alive) return
        try {
          const p = await api.parcelById(id)
          if (alive) setGeometry(id, p.geometry)
        } catch {
          /* keep the dot at the centroid */
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.length])

  const cropName = (id?: string) => crops.find((c) => c.id === id)?.name

  const check = async (f: SavedField) => {
    if (!f.crop) return false
    setChecking((s) => new Set(s).add(f.id))
    try {
      record(await api.analyse(f.id, f.crop, toIso(new Date())))
      return true
    } catch (e) {
      toast.error(`${f.name}: ${e instanceof Error ? e.message : 'nie udało się sprawdzić'}`)
      return false
    } finally {
      setChecking((s) => {
        const n = new Set(s)
        n.delete(f.id)
        return n
      })
    }
  }

  // one after another, never in parallel: the public data services limit requests per network
  const checkAll = async () => {
    const todo = fields.filter((f) => f.crop)
    setBatch({ done: 0, total: todo.length })
    let ok = 0
    for (const [i, f] of todo.entries()) {
      if (await check(f)) ok++
      setBatch({ done: i + 1, total: todo.length })
    }
    setBatch(null)
    toast.success(`Sprawdzono ${ok} z ${todo.length} pól`)
  }

  const stats = useMemo(() => {
    const checked = fields.filter((f) => f.last)
    const attention = fields.filter((f) => ['susza', 'uwaga'].includes(fieldStatus(f.last)))
    const area = fields.reduce((s, f) => s + f.area_ha, 0)
    const newest = checked
      .map((f) => f.last!.checkedAt)
      .sort()
      .at(-1)
    return { checked: checked.length, attention, area, newest }
  }, [fields])

  const shown = useMemo(() => {
    const list = fields.map((f, index) => ({ f, index }))
    if (filter === 'uwaga') return list.filter(({ f }) => ['susza', 'uwaga'].includes(fieldStatus(f.last)))
    if (filter === 'niesprawdzone') return list.filter(({ f }) => !f.last)
    return list
  }, [fields, filter])

  if (fields.length === 0)
    return (
      <div className="grid max-w-3xl gap-4">
        <div>
          <h1 className="type-headline sm:type-display">Moje pola</h1>
          <p className="text-muted-foreground mt-1">Zapisane w tej przeglądarce. Nie zakładasz konta.</p>
        </div>
        <Card>
          <CardContent>
            <EmptyState
              title="Nie masz jeszcze zapisanych pól"
              description="Wybierz działkę na mapie i kliknij „Zapisz w Moich polach”. Tutaj zobaczysz wszystkie swoje pola na jednej mapie i ich stan wody."
              action={
                <Button size="lg" nativeButton={false} render={<Link to="/" />}>
                  Wybierz działkę
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    )

  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: 'wszystkie', label: 'Wszystkie', n: fields.length },
    { id: 'uwaga', label: 'Wymagają uwagi', n: stats.attention.length },
    {
      id: 'niesprawdzone',
      label: 'Niesprawdzone',
      n: fields.length - stats.checked,
    },
  ]

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-headline sm:type-display">Moje pola</h1>
          <p className="text-muted-foreground mt-1">Zapisane w tej przeglądarce. Nie zakładasz konta, nic nie trafia na serwer.</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button onClick={checkAll} disabled={!!batch || !fields.some((f) => f.crop)}>
            {batch ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {batch ? `Sprawdzam ${Math.min(batch.done + 1, batch.total)} z ${batch.total}…` : 'Sprawdź wszystkie na dziś'}
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(fields)}>
            <Download /> Zestawienie CSV
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
            <Plus /> Dodaj pole
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pola" value={String(fields.length)} hint={`sprawdzone: ${stats.checked}`} />
        <Stat label="Powierzchnia łącznie" value={ha(stats.area)} />
        <Stat
          label="Wymagają uwagi"
          value={String(stats.attention.length)}
          hint={
            stats.attention.length
              ? stats.attention
                  .map((f) => f.name)
                  .slice(0, 2)
                  .join(', ') + (stats.attention.length > 2 ? '…' : '')
              : 'brak niedoboru wody'
          }
        />
        <Stat
          label="Ostatnie sprawdzenie"
          value={stats.newest ? formatRelative(stats.newest) : '–'}
          hint={stats.newest ? formatDate(stats.newest) : 'jeszcze nie sprawdzano'}
        />
      </div>

      {/* desktop: list left, map right (sticky); mobile: map first, list below */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="lg:col-start-2 lg:row-start-1">
          <FieldsMap
            fields={fields}
            selected={selected}
            onSelect={setSelected}
            className="h-[320px] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:max-h-[720px]"
          />
        </div>
        <div className="grid content-start gap-3 lg:col-start-1 lg:row-start-1">
          <div className="no-print flex flex-wrap gap-1" role="tablist" aria-label="Filtr pól">
            {FILTERS.map((x) => (
              <Button
                key={x.id}
                role="tab"
                aria-selected={filter === x.id}
                size="sm"
                variant={filter === x.id ? 'default' : 'outline'}
                onClick={() => setFilter(x.id)}
              >
                {x.label} <span className="tabular-nums opacity-70">{x.n}</span>
              </Button>
            ))}
          </div>
          {shown.length === 0 && <p className="text-muted-foreground py-6 text-center text-sm">Brak pól w tym widoku.</p>}
          {[...shown]
            .sort((a, b) => (filter === 'uwaga' ? STATUS_ORDER.indexOf(fieldStatus(a.f.last)) - STATUS_ORDER.indexOf(fieldStatus(b.f.last)) : 0))
            .map(({ f, index }) => (
              <FieldCard
                key={f.id}
                f={f}
                index={index}
                cropName={cropName(f.crop)}
                selected={selected === f.id}
                checking={checking.has(f.id)}
                onSelect={() => setSelected(f.id)}
                onCheck={() => check(f)}
              />
            ))}
        </div>
      </div>
    </div>
  )
}
