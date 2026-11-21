import { useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import type { SceneStats } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type Kind = 'rgb' | 'ndmi'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'rgb', label: 'Kolory naturalne' },
  { id: 'ndmi', label: 'Wilgotność roślin (NDMI)' },
]

// same ramp as the backend (services/sentinel.NDMI_RAMP), −0.4 … 0.6
const NDMI_GRADIENT = 'linear-gradient(to right, #8c510a 0%, #d8b365 30%, #f6e8c3 50%, #c7eae5 65%, #5ab4ac 80%, #01665e 100%)'

/** "Pokaż zdjęcie": the Sentinel-2 scene used in the report, around the parcel, as true colour or NDMI map. */
export function SatelliteImageDialog({ scene, parcelId }: { scene: SceneStats; parcelId: string }) {
  const [kind, setKind] = useState<Kind>('rgb')
  const [state, setState] = useState<Record<Kind, 'loading' | 'ok' | 'error'>>({ rgb: 'loading', ndmi: 'loading' })
  const src = (k: Kind) => `/api/analysis/satellite/image?scene=${encodeURIComponent(scene.scene)}&parcel_id=${encodeURIComponent(parcelId)}&kind=${k}`

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="justify-self-start" />}>
        <ImageIcon /> Pokaż zdjęcie satelitarne
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Zdjęcie satelitarne z {formatDate(scene.date)}</DialogTitle>
          <DialogDescription>Sentinel-2, piksel 10–20 m. Działka zaznaczona zieloną linią, wokół okoliczne pola.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1" role="tablist" aria-label="Rodzaj obrazu">
          {KINDS.map((k) => (
            <Button
              key={k.id}
              role="tab"
              aria-selected={kind === k.id}
              variant={kind === k.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </Button>
          ))}
        </div>

        <div className="bg-muted relative grid aspect-square w-full place-items-center overflow-hidden rounded-md">
          {/* both images load once and stay mounted, so switching is instant */}
          {KINDS.map((k) => (
            <img
              key={k.id}
              src={src(k.id)}
              alt={k.id === 'rgb' ? 'Działka na zdjęciu satelitarnym w kolorach naturalnych' : 'Mapa wilgotności roślin NDMI wokół działki'}
              className={cn('absolute inset-0 size-full object-contain', kind !== k.id && 'invisible')}
              style={{ imageRendering: k.id === 'ndmi' ? 'pixelated' : 'auto' }}
              onLoad={() => setState((s) => ({ ...s, [k.id]: 'ok' }))}
              onError={() => setState((s) => ({ ...s, [k.id]: 'error' }))}
            />
          ))}
          {state[kind] === 'loading' && (
            <p className="text-muted-foreground relative flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Pobieram zdjęcie…
            </p>
          )}
          {state[kind] === 'error' && <p className="text-muted-foreground relative text-sm">Nie udało się pobrać zdjęcia. Spróbuj ponownie później.</p>}
        </div>

        {kind === 'ndmi' && (
          <div className="grid gap-1 text-xs">
            <div className="h-3 rounded-sm" style={{ background: NDMI_GRADIENT }} aria-hidden />
            <div className="text-muted-foreground relative flex justify-between">
              <span>sucho (−0,4)</span>
              <span className="absolute left-[40%] -translate-x-1/2">0</span>
              <span>wilgotno (0,6)</span>
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-[#bebebe]" aria-hidden /> chmury, cienie lub brak danych
            </p>
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Zawiera zmodyfikowane dane Copernicus Sentinel {scene.date.slice(0, 4)} (ESA), pobrane przez Earth Search (Element 84). Chmury w całej scenie:{' '}
          {scene.cloud_cover.toLocaleString('pl-PL')}%, nad działką: {Math.round((1 - scene.clear_share) * 100)}%.
        </p>
      </DialogContent>
    </Dialog>
  )
}
