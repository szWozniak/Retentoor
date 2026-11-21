import { useEffect, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, WMSTileLayer, useMap, useMapEvents } from 'react-leaflet'
import { LocateFixed, Loader2 } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LandUse, Parcel } from '@/api'

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

export const LANDUSE_COLORS: Record<LandUse['class'], string> = {
  rolna: '#22c55e',
  mieszana: '#f59e0b',
  nierolna: '#ef4444',
  nieznana: '#facc15',
}

/**
 * WMS layer that asks for higher-resolution images below KIEG_NATIVE_ZOOM, so the server still draws
 * boundaries at zoom 15-16 (e.g. a 1024px image squeezed into a 256px tile at zoom 15).
 */
const HiResWMS = L.TileLayer.WMS.extend({
  getTileUrl(this: L.TileLayer.WMS & { wmsParams: L.WMSParams }, coords: L.Coords) {
    const factor = Math.min(4, Math.max(1, 2 ** (KIEG_NATIVE_ZOOM - coords.z)))
    this.wmsParams.width = this.wmsParams.height = 256 * factor
    return L.TileLayer.WMS.prototype.getTileUrl.call(this, coords)
  },
}) as unknown as typeof L.TileLayer.WMS

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
      className: 'parcel-boundaries', // recoloured in index.css (server draws them blue)
      keepBuffer: 4,
      updateWhenZooming: false,
      attribution: 'Działki &copy; GUGiK (KIEG)',
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

function FitToParcel({ parcel }: { parcel: Parcel | null }) {
  const map = useMap()
  useEffect(() => {
    if (!parcel) return
    const bounds = L.geoJSON(parcel.geometry).getBounds()
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 18, duration: 0.6 })
  }, [parcel, map])
  return null
}

export function ParcelMap({ parcel, markers, focus, userPos, onLocate, locating, onPick, busy, className }: Props) {
  const [zoom, setZoom] = useState(6)
  const color = parcel ? LANDUSE_COLORS[parcel.landuse?.class ?? 'nieznana'] : LANDUSE_COLORS.nieznana

  return (
    <div className={`relative overflow-hidden rounded-xl border ${className ?? ''}`}>
      <MapContainer
        center={POLAND_CENTER}
        zoom={6}
        minZoom={5}
        maxZoom={20}
        zoomSnap={0.5}
        wheelPxPerZoomLevel={90}
        className="h-full w-full"
        style={{ cursor: busy ? 'progress' : 'crosshair' }}
      >
        <TileLayer
          url={ORTHO_WMTS}
          maxNativeZoom={19}
          maxZoom={20}
          keepBuffer={4}
          attribution='Ortofotomapa &copy; <a href="https://www.geoportal.gov.pl">GUGiK</a>'
        />
        <ParcelBoundaries />
        {/* drainage ditches (BDOT10k, GUGiK) – where a weir could hold water back */}
        <WMSTileLayer
          url="https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer"
          params={{ layers: 'row', format: 'image/png', transparent: true, version: '1.3.0' } as L.WMSParams}
          // this server does not support EPSG:3857 (requests hang) – ask in EPSG:4326; distortion is negligible at zoom 14+
          crs={L.CRS.EPSG4326}
          tileSize={512}
          minZoom={15}
          maxZoom={20}
          opacity={0.9}
          attribution="Rowy &copy; GUGiK (BDOT10k)"
        />
        {parcel && (
          <GeoJSON
            key={`${parcel.id}-${color}`}
            data={parcel.geometry}
            style={{ color, weight: 3, fillColor: color, fillOpacity: 0.2 }}
          />
        )}
        {markers?.map((m) => (
          <CircleMarker key={`${m.lat},${m.lon}`} center={[m.lat, m.lon]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 0.95 }}>
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
      {zoom < PARCELS_MIN_ZOOM && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-center text-xs text-white">
          Przybliż mapę, aby zobaczyć granice działek, albo kliknij w swoje pole
        </div>
      )}
      {busy && (
        <div className="pointer-events-none absolute right-3 bottom-8 z-[1000] rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">
          Szukam działki…
        </div>
      )}
      <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-background/90 px-2 py-1 text-xs text-foreground">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 rounded-full bg-chart-1" /> rów melioracyjny
        </span>
        {(['rolna', 'mieszana', 'nierolna'] as const).map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: LANDUSE_COLORS[c] }} /> {c}
          </span>
        ))}
      </div>
    </div>
  )
}
