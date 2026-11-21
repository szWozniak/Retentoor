import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/skeletons'
import { useAsync } from '@/hooks/useAsync'
import { formatRelative } from '@/lib/format'

export default function RecordsPage() {
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const { data: records, loading, error, reload } = useAsync(() => api.listRecords(q), [q])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return toast.warning('Podaj tytuł')
    setSaving(true)
    try {
      await api.createRecord({ title, content })
      toast.success('Dodano rekord', { description: title })
      setTitle('')
      setContent('')
      reload()
    } catch (err) {
      toast.error('Nie udało się dodać rekordu', { description: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number, name: string) => {
    try {
      await api.deleteRecord(id)
      toast.success('Usunięto rekord', { description: name })
      reload()
    } catch (err) {
      toast.error('Nie udało się usunąć', { description: String(err) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekordy</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Input className="sm:w-48" placeholder="Tytuł" aria-label="Tytuł" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Treść" aria-label="Treść" value={content} onChange={(e) => setContent(e.target.value)} />
          <Button type="submit" disabled={saving}>
            {saving ? 'Zapisuję…' : 'Dodaj'}
          </Button>
        </form>
        <Input className="mb-3" placeholder="Szukaj…" aria-label="Szukaj" value={q} onChange={(e) => setQ(e.target.value)} />

        {loading && !records ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !records?.length ? (
          <EmptyState
            title={q ? 'Nic nie znaleziono' : 'Brak rekordów'}
            description={q ? `Brak wyników dla „${q}”.` : 'Dodaj pierwszy rekord formularzem powyżej.'}
          />
        ) : (
          <ul className="divide-y">
            {records.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 py-2">
                <div>
                  <p className="font-medium">{r.title}</p>
                  {r.content && <p className="text-muted-foreground text-sm">{r.content}</p>}
                  <p className="text-muted-foreground text-xs">{formatRelative(r.created_at + (r.created_at.endsWith('Z') || r.created_at.includes('+') ? '' : 'Z'))}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id, r.title)}>
                  usuń
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
