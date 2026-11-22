import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ORTHO_WMTS } from '@/components/map/ParcelMap'
import { fieldStatus, type FieldStatus, type SavedField } from '@/lib/fields'

/** Map colours per field state (light-theme roles, readable on the orthophoto). */
export const STATUS_STYLE: Record<FieldStatus, { stroke: string; fill: string; label: string }> = {
  susza: { stroke: '#ba1a1a', fill: '#ffdad6', label: 'niedobór wody' },
  uwaga: { stroke: '#d97706', fill: '#ffdea9', label: 'suszej niż zwykle' },
  ok: { stroke: '#15803d', fill: '#dcfce7', label: 'woda w normie' },
  'poza sezonem': { stroke: '#4d4d4d', fill: '#e8e8e8', label: 'poza sezonem' },
  nieznany: { stroke: '#737373', fill: '#f2f2f2', label: 'nie sprawdzono' },
}

function boundsOf(fields: SavedField[]) {
  const b = L.latLngBounds([])
  for (const f of fields) {
    if (f.geometry) b.extend(L.geoJSON(f.geometry).getBounds())
    else b.extend(f.centroid)
  }
  return b
}

/** Fit all fields once (and again when the set of fields changes); fly to the selected one. */
function Fit({ fields, selected }: { fields: SavedField[]; selected: string | null }) {
  const map = useMap()
  const key = fields.map((f) => f.id + (f.geometry ? 'g' : '')).join(',')
  useEffect(() => {
    const b = boundsOf(fields)
    if (b.isValid()) map.fitBounds(b.pad(0.25), { maxZoom: 16, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  useEffect(() => {
    const f = fields.find((x) => x.id === selected)
    if (!f) return
    const b = boundsOf([f])
    map.flyToBounds(b.pad(1.2), { maxZoom: 17, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, map])
  return null
}

type Props = {
  fields: SavedField[]
  selected: string | null
  onSelect: (id: string) => void
  className?: string
}

/** All saved fields at once on the orthophoto, coloured by their last water assessment. */
export function FieldsMap({ fields, selected, onSelect, className }: Props) {
  const present = useMemo(() => new Set(fields.map((f) => fieldStatus(f.last))), [fields])

  return (
    <div className={`relative overflow-hidden rounded-xl border select-none ${className ?? ''}`}>
      <MapContainer center={[52.1, 19.4]} zoom={6} minZoom={5} maxZoom={19} zoomSnap={1} className="h-full w-full">
        <TileLayer url={ORTHO_WMTS} maxNativeZoom={19} maxZoom={19} attribution='Ortofotomapa &copy; <a href="https://www.geoportal.gov.pl">GUGiK</a>' />
        {fields.map((f) => {
          const st = STATUS_STYLE[fieldStatus(f.last)]
          const active = f.id === selected
          const tip = (
            <Tooltip direction="top" sticky={!!f.geometry} offset={[0, -6]}>
              <b>{f.name}</b>
              <br />
              {st.label}
            </Tooltip>
          )
          if (!f.geometry)
            return (
              <CircleMarker
                key={f.id}
                center={f.centroid}
                radius={active ? 10 : 7}
                pathOptions={{
                  color: '#fff',
                  weight: 3,
                  fillColor: st.stroke,
                  fillOpacity: 1,
                }}
                eventHandlers={{ click: () => onSelect(f.id) }}
              >
                {tip}
              </CircleMarker>
            )
          return (
            <GeoJSON
              key={`${f.id}-${active}-${st.stroke}`}
              data={f.geometry}
              style={{
                color: active ? '#fff' : st.stroke,
                weight: active ? 5 : 3,
                fillColor: st.fill,
                fillOpacity: active ? 0.6 : 0.4,
              }}
              eventHandlers={{ click: () => onSelect(f.id) }}
            >
              {tip}
            </GeoJSON>
          )
        })}
        {/* the selected field: coloured outline on top of its white halo */}
        {fields
          .filter((f) => f.id === selected && f.geometry)
          .map((f) => (
            <GeoJSON
              key={`${f.id}-sel`}
              data={f.geometry!}
              interactive={false}
              style={{
                color: STATUS_STYLE[fieldStatus(f.last)].stroke,
                weight: 2.5,
                fill: false,
              }}
            />
          ))}
        {/* small-scale view: fields are tiny, so also mark each with a dot */}
        <Dots fields={fields} onSelect={onSelect} />
        <Fit fields={fields} selected={selected} />
      </MapContainer>

      <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-background/90 px-2 py-1 text-xs text-foreground">
        {(Object.keys(STATUS_STYLE) as FieldStatus[])
          .filter((s) => present.has(s))
          .map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className="size-3 rounded-sm border-2"
                style={{
                  background: STATUS_STYLE[s].fill,
                  borderColor: STATUS_STYLE[s].stroke,
                }}
              />{' '}
              {STATUS_STYLE[s].label}
            </span>
          ))}
      </div>
    </div>
  )
}

/** Below zoom 13 a parcel polygon is a few pixels wide: draw a clickable dot at its centre instead. */
function Dots({ fields, onSelect }: { fields: SavedField[]; onSelect: (id: string) => void }) {
  const map = useMap()
  const zoom = useZoom(map)
  if (zoom >= 13) return null
  return (
    <>
      {fields
        .filter((f) => f.geometry)
        .map((f) => (
          <CircleMarker
            key={`${f.id}-dot`}
            center={f.centroid}
            radius={6}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: STATUS_STYLE[fieldStatus(f.last)].stroke,
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(f.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {f.name}
            </Tooltip>
          </CircleMarker>
        ))}
    </>
  )
}

function useZoom(map: L.Map) {
  const [zoom, setZoom] = useState(map.getZoom())
  useEffect(() => {
    const on = () => setZoom(map.getZoom())
    map.on('zoomend', on)
    return () => {
      map.off('zoomend', on)
    }
  }, [map])
  return zoom
}
