import { useEffect, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { LocateFixed, Loader2 } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LandUse, Parcel } from '@/api'
import { cn } from '@/lib/utils'

/**
 * Map for picking a parcel:
 * - basemap: GUGiK orthophoto as cached WMTS tiles (EPSG:3857 grid) – fast, free, no API key
 * - overlay: cadastral parcel boundaries + numbers (GUGiK KIEG WMS)
 * - click -> onPick(lat, lon); selected parcel drawn as a vector, coloured by land-use class
 */

const ORTHO_WMTS =
  'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTOFOTOMAPA&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}'
const PARCELS_WMS = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow'
/** KIEG only renders boundaries at ~zoom 17 resolution or finer. */
const KIEG_NATIVE_ZOOM = 17
const PARCELS_MIN_ZOOM = 15
const POLAND_CENTER: L.LatLngTuple = [52.1, 19.4]

/** Same roles as the UI (light-theme M3 values): dark stroke = colour role, light fill = its container. */
export const LANDUSE_STYLE: Record<LandUse['class'], { stroke: string; fill: string }> = {
  rolna: { stroke: '#2b6a46', fill: '#aff1c3' }, // primary / primary-container
  mieszana: { stroke: '#7d5800', fill: '#ffdea9' }, // warning
  nierolna: { stroke: '#ba1a1a', fill: '#ffdad6' }, // error
  nieznana: { stroke: '#717971', fill: '#dfe4dd' }, // land use still loading / unknown: neutral grey (outline role)
}
const MARKER = '#2b6a46'

/**
 * Loading priority on a slow connection: parcel grid (high) → orthophoto (normal) → ditches (low, added only after
 * the orthophoto has loaded). `fetchPriority` on the tile <img> tells the browser which requests go first.
 */
function withPriority<T extends typeof L.TileLayer.WMS>(Base: T, priority: 'high' | 'low'): T {
  return Base.extend({
    createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
      const self = this as unknown as { _tileOnLoad: () => void; _tileOnError: () => void }
      const tile = document.createElement('img') as HTMLImageElement & { fetchPriority?: string }
      L.DomEvent.on(tile, 'load', L.Util.bind(self._tileOnLoad, this, done, tile))
      L.DomEvent.on(tile, 'error', L.Util.bind(self._tileOnError, this, done, tile))
      tile.alt = ''
      tile.setAttribute('role', 'presentation')
      tile.fetchPriority = priority
      tile.decoding = 'async'
      tile.src = this.getTileUrl(coords)
      return tile
    },
  }) as unknown as T
}

/**
 * WMS layer that asks for higher-resolution images below KIEG_NATIVE_ZOOM, so the server still draws
 * boundaries at zoom 15-16 (e.g. a 1024px image squeezed into a 256px tile at zoom 15).
 */
const HiResWMSBase = L.TileLayer.WMS.extend({
  getTileUrl(this: L.TileLayer.WMS & { wmsParams: L.WMSParams }, coords: L.Coords) {
    const factor = Math.min(4, Math.max(1, 2 ** (KIEG_NATIVE_ZOOM - coords.z)))
    this.wmsParams.width = this.wmsParams.height = 256 * factor
    return L.TileLayer.WMS.prototype.getTileUrl.call(this, coords)
  },
}) as unknown as typeof L.TileLayer.WMS
const HiResWMS = withPriority(HiResWMSBase, 'high')
const LowWMS = withPriority(L.TileLayer.WMS, 'low')

function ParcelBoundaries() {
  const map = useMap()
  useEffect(() => {
    const layer = new HiResWMS(PARCELS_WMS, {
      layers: 'dzialki,numery_dzialek',
      format: 'image/png',
      transparent: true,
      minZoom: PARCELS_MIN_ZOOM,
      maxZoom: 20,
      tileSize: 256,
      opacity: 0.85,
      zIndex: 3, // above the ditches
      className: 'parcel-boundaries', // recoloured in index.css (server draws them blue)
      keepBuffer: 1,
      updateWhenZooming: false,
      updateWhenIdle: true,
      attribution: 'Działki &copy; GUGiK (KIEG)',
    } as L.WMSOptions)
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map])
  return null
}

/** Drainage ditches (BDOT10k, GUGiK) – last priority: mounted after the orthophoto has loaded once. */
function Ditches() {
  const map = useMap()
  useEffect(() => {
    const layer = new LowWMS('https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer', {
      layers: 'row',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      // this server does not support EPSG:3857 (requests hang) – ask in EPSG:4326; distortion is negligible at zoom 15+
      crs: L.CRS.EPSG4326,
      tileSize: 512,
      minZoom: 15,
      maxZoom: 20,
      zIndex: 2,
      keepBuffer: 0,
      updateWhenIdle: true,
      updateWhenZooming: false,
      className: 'ditch-lines',
      attribution: 'Rowy &copy; GUGiK (BDOT10k)',
    } as L.WMSOptions)
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map])
  return null
}

export type MapMarker = { lat: number; lon: number; label: string }

type Props = {
  parcel: Parcel | null
  markers?: MapMarker[]
  /** the farmer's GPS position (blue dot + accuracy circle) */
  userPos?: { lat: number; lon: number; accuracy: number } | null
  onLocate?: () => void
  locating?: boolean
  /** when set (new object each time), the map flies to this point */
  focus?: { lat: number; lon: number; t: number; zoom?: number } | null
  onPick: (lat: number, lon: number) => void
  busy?: boolean
  className?: string
}

function ClickHandler({ onPick, onZoom }: { onPick: Props['onPick']; onZoom: (z: number) => void }) {
  const map = useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
    zoomend: () => onZoom(map.getZoom()),
  })
  return null
}

function FlyTo({ focus }: { focus: Props['focus'] }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], focus.zoom ?? Math.max(map.getZoom(), 18), { duration: focus.zoom && focus.zoom < 16 ? 1.2 : 0.6 })
  }, [focus, map])
  return null
}

/**
 * Move the map only when needed: if the new parcel is already well inside the view at a zoom where parcel
 * boundaries are drawn, leave the map alone. Otherwise show it with its neighbours around (not a tight zoom).
 */
function FitToParcel({ parcel }: { parcel: Parcel | null }) {
  const map = useMap()
  const id = parcel?.id
  useEffect(() => {
    if (!parcel) return
    const bounds = L.geoJSON(parcel.geometry).getBounds()
    const view = map.getBounds().pad(-0.1) // ignore a 10% margin at the edges
    if (map.getZoom() >= PARCELS_MIN_ZOOM && view.contains(bounds)) return
    const zoom = Math.min(17, Math.max(PARCELS_MIN_ZOOM + 1, Math.floor(map.getBoundsZoom(bounds.pad(1.5)))))
    map.flyTo(bounds.getCenter(), zoom, { duration: map.getZoom() < 12 ? 1.2 : 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, map])
  return null
}

export function ParcelMap({ parcel, markers, focus, userPos, onLocate, locating, onPick, busy, className }: Props) {
  const [zoom, setZoom] = useState(6)
  const [orthoReady, setOrthoReady] = useState(false)
  const [showDitches, setShowDitches] = useState(true)
  const st = LANDUSE_STYLE[parcel?.landuse?.class ?? 'nieznana']

  return (
    <div className={`relative overflow-hidden rounded-xl border select-none ${className ?? ''}`}>
      <MapContainer
        center={POLAND_CENTER}
        zoom={6}
        minZoom={5}
        maxZoom={20}
        zoomSnap={1} // whole levels: scaled tiles leave white seams through the parcel-line filter
        wheelPxPerZoomLevel={120}
        className="h-full w-full"
        style={{ cursor: 'pointer' }}
      >
        <ParcelBoundaries />
        <TileLayer
          url={ORTHO_WMTS}
          maxNativeZoom={19}
          maxZoom={20}
          zIndex={1}
          keepBuffer={2}
          eventHandlers={{ load: () => setOrthoReady(true) }}
          attribution='Ortofotomapa &copy; <a href="https://www.geoportal.gov.pl">GUGiK</a>'
        />
        {orthoReady && showDitches && <Ditches />}
        {parcel && (
          <>
            {/* white halo keeps the outline readable on any orthophoto */}
            <GeoJSON key={`${parcel.id}-halo`} data={parcel.geometry} interactive={false} style={{ color: '#fff', weight: 7, opacity: 0.85, fill: false }} />
            <GeoJSON
              key={`${parcel.id}-${parcel.landuse?.class ?? 'loading'}`}
              data={parcel.geometry}
              interactive={false}
              style={{ color: st.stroke, weight: 3.5, fillColor: st.fill, fillOpacity: 0.35 }}
            />
          </>
        )}

        {markers?.map((m) => (
          <CircleMarker key={`${m.lat},${m.lon}`} center={[m.lat, m.lon]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: MARKER, fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -8]} permanent>{m.label}</Tooltip>
          </CircleMarker>
        ))}
        {userPos && (
          <>
            <Circle center={[userPos.lat, userPos.lon]} radius={userPos.accuracy} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />
            <CircleMarker center={[userPos.lat, userPos.lon]} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}>
              <Tooltip direction="top" offset={[0, -8]}>Jesteś tutaj</Tooltip>
            </CircleMarker>
          </>
        )}
        <FlyTo focus={focus} />
        <ClickHandler onPick={onPick} onZoom={setZoom} />
        <FitToParcel parcel={parcel} />
      </MapContainer>

      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="bg-background text-foreground hover:bg-muted absolute top-[86px] left-[11px] z-[1000] grid size-[34px] place-items-center rounded-md border"
          aria-label="Pokaż moją lokalizację"
          title="Moja lokalizacja"
        >
          {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
        </button>
      )}
      {zoom >= PARCELS_MIN_ZOOM && (
        <button
          type="button"
          role="switch"
          aria-checked={showDitches}
          onClick={() => setShowDitches((v) => !v)}
          className="bg-background text-foreground hover:bg-muted absolute top-3 right-3 z-[1000] flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-bold"
        >
          <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', showDitches ? 'bg-primary' : 'bg-outline')} aria-hidden>
            <span className={cn('absolute top-0.5 size-3 rounded-full bg-white transition-all', showDitches ? 'left-3.5' : 'left-0.5')} />
          </span>
          Rowy melioracyjne
        </button>
      )}
      {zoom < PARCELS_MIN_ZOOM && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-center text-xs text-white">
          Przybliż mapę, aby zobaczyć granice działek, albo kliknij w swoje pole
        </div>
      )}
      {busy && (
        // blocks further clicks until the lookup finishes
        <div className="bg-background/20 absolute inset-0 z-[1000] grid place-items-center" aria-live="polite">
          <span className="bg-background text-foreground flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-lg">
            <Loader2 className="text-primary size-4 animate-spin" aria-hidden /> Szukam działki…
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-background/90 px-2 py-1 text-xs text-foreground">
        {(['rolna', 'mieszana', 'nierolna'] as const).map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="size-3 rounded-sm border-2" style={{ background: LANDUSE_STYLE[c].fill, borderColor: LANDUSE_STYLE[c].stroke }} /> {c}
          </span>
        ))}
      </div>
    </div>
  )
}
