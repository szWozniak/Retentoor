import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { api, type Crop } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { useSavedFields, type SavedField } from '@/lib/fields'
import { formatNumber } from '@/lib/format'

function FieldRow({ f, cropName }: { f: SavedField; cropName?: string }) {
  const { rename, remove } = useSavedFields()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(f.name)
  const analyseUrl = `/?dzialka=${encodeURIComponent(f.id)}${f.crop ? `&uprawa=${f.crop}` : ''}`

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
              <Input className="h-10 max-w-xs text-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Nazwa pola" />
              <Button type="submit" size="icon" className="size-10" aria-label="Zapisz nazwę">
                <Check />
              </Button>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-lg font-semibold">
              {f.name}
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(true)} aria-label={`Zmień nazwę: ${f.name}`}>
                <Pencil className="size-4" />
              </Button>
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            {f.commune}, {f.voivodeship} · {formatNumber(Math.round(f.area_ha * 100) / 100)} ha
            {cropName && <> · ostatnio: {cropName.toLowerCase()}</>}
          </p>
          <p className="text-muted-foreground font-mono text-xs">{f.id}</p>
        </div>
        <div className="flex gap-2">
          <Button size="lg" className="h-11" nativeButton={false} render={<Link to={analyseUrl} />}>
            Sprawdź pole
          </Button>
          <Button variant="outline" size="icon" className="size-11" onClick={() => remove(f.id)} aria-label={`Usuń ${f.name}`}>
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function FieldsPage() {
  const { fields } = useSavedFields()
  const [crops, setCrops] = useState<Crop[]>([])
  useEffect(() => {
    api.crops().then(setCrops).catch(() => {})
  }, [])
  const cropName = (id?: string) => crops.find((c) => c.id === id)?.name

  return (
    <div className="grid max-w-3xl gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Moje pola</h1>
        <p className="text-muted-foreground mt-1">Zapisane w tej przeglądarce. Nie zakładasz konta.</p>
      </div>
      {fields.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title="Nie masz jeszcze zapisanych pól"
              description="Wybierz działkę na mapie i kliknij „Zapisz pole”, żeby wracać do niej jednym kliknięciem."
              action={
                <Button size="lg" nativeButton={false} render={<Link to="/" />}>
                  Wybierz działkę
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        fields.map((f) => <FieldRow key={f.id} f={f} cropName={cropName(f.crop)} />)
      )}
    </div>
  )
}
