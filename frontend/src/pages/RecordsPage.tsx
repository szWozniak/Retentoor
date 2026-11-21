import { useEffect, useState, type FormEvent } from 'react'
import { api, type Record } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function RecordsPage() {
  const [records, setRecords] = useState<Record[]>([])
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => api.listRecords(q).then(setRecords).catch((e) => setError(String(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await api.createRecord({ title, content })
    setTitle('')
    setContent('')
    load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekordy</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Input className="sm:w-48" placeholder="Tytuł" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Treść" value={content} onChange={(e) => setContent(e.target.value)} />
          <Button type="submit">Dodaj</Button>
        </form>
        <Input className="mb-3" placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <p className="text-destructive mb-2 text-sm">{error}</p>}
        <ul className="divide-y">
          {records.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-4 py-2">
              <div>
                <p className="font-medium">{r.title}</p>
                {r.content && <p className="text-muted-foreground text-sm">{r.content}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => api.deleteRecord(r.id).then(load)}>
                usuń
              </Button>
            </li>
          ))}
          {records.length === 0 && <li className="text-muted-foreground py-2 text-sm">Brak rekordów</li>}
        </ul>
      </CardContent>
    </Card>
  )
}
