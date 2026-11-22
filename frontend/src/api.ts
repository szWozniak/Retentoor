export type Parcel = {
  id: string
  voivodeship: string
  county: string
  commune: string
  region: string // obręb
  number: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  centroid: [number, number] // [lat, lon]
  area_ha: number
  fetched_at: string
  from_cache: boolean
  source: string
  /** null until the second (slower) land-use request has finished */
  landuse: LandUse | null
}

export type LandUse = {
  class: 'rolna' | 'mieszana' | 'nierolna' | 'nieznana'
  agricultural_share: number | null
  label: string
  parts: { code: number; label: string; share: number }[]
  source?: string
}

export type Crop = { id: string; name: string }

export type Place = { label: string; sub: string; lat: number; lon: number; kind: 'place' | 'address'; zoom: number; source: string }

export type PeriodResult = {
  period: string
  start: string
  end: string
  kbw: number | null
  threshold: number | 'x' | null
  drought: boolean | null
  margin: number | null
  p: number | null
  et0: number | null
}

export type Source = { name: string; url: string; fetched_at: string | null; license?: string; range?: string }

export type Cause = { id: string; title: string; status: 'tak' | 'częściowo' | 'nie' | 'brak danych'; evidence: string[] }

export type Recommendation = {
  id: string
  stage: 'retencja_krajobrazowa' | 'retencja_glebowa' | 'agrotechnika' | 'nawadnianie'
  title: string
  action: string
  why: string[]
  priority: 'wysoki' | 'średni' | 'niski'
  basis: string[]
  permit: string | null
  location: { lat: number; lon: number; label: string } | null
}

export type Irrigation = {
  decision: 'zasadne' | 'niezasadne' | 'wstrzymaj się' | 'poza sezonem'
  dose_mm: number
  in_field: boolean
  depletion_mm?: number
  raw_mm?: number
  taw_mm?: number
  p_next7_mm?: number | null
}

export type Analysis = {
  parcel: Parcel
  crop: Crop
  analysis_date: string
  soil: {
    code: number | null
    category: string | null
    category_used: string | null
    label: string
    shares: { [code: string]: number }
    n_points: number
    agricultural: boolean
  }
  current: {
    window: {
      start: string
      end: string
      kbw: number | null
      percentile: number | null
      median_hist: number | null
      coverage: number
      history: { year: number; kbw: number }[]
    }
    season_periods: PeriodResult[]
    last_period: PeriodResult | null
    in_season: boolean
  }
  history: {
    years: { year: number; drought: boolean; periods: { period: string; kbw: number | null; threshold: number | 'x' | null; drought: boolean | null }[] }[]
    years_with_drought: number
    years_total: number
    period_frequency: { period: string; share: number; n: number }[]
  }
  /** wsteczna = past date, biezaca = today (±2 days), prognoza = future date (weather forecast up to 16 days) */
  mode: 'wsteczna' | 'biezaca' | 'prognoza'
  /** days whose weather is a forecast, not an observation (future dates only) */
  forecast_span: { from: string; to: string; method: string; label: string } | null
  series: { date: string; kbw: number | null; median: number | null; threshold: number | null; forecast: boolean }[]
  soilgrids: { clay_pct: number; sand_pct: number; silt_pct: number; soc_pct: number; om_pct: number; awc_mm_100: number; awc_mm_30: number; texture: string } | null
  terrain: { min_m: number; max_m: number; relief_m: number; slope_pct: number; max_local_slope_pct: number; downslope_dir: string | null; lowest_point: [number, number]; highest_point: [number, number] } | null
  surroundings: { water_share: number; forest_share: number; organic_share: number; built_share: number; nearest_water_m: number | null } | null
  causes: Cause[]
  recommendations: Recommendation[]
  irrigation: Irrigation | null
  crop_comparison: { crop: string; name: string; drought_years: number | null; n: number; suited: boolean }[]
  /** "Ile wody zatrzymasz" – volumes in m³ (the pond comes from /analysis/runoff) */
  water: Water | null
  confidence: 'wysoki' | 'średni' | 'niski'
  limitations: string[]
  missing: string[]
  sources: Source[]
  elapsed_s: number
}

export type SceneStats = {
  scene: string
  date: string
  cloud_cover: number
  clear_share: number
  ndvi: number | null
  ndmi: number | null
  n_px: number
}

/** Sentinel-2 confirmation of the water assessment (separate request – cold imagery reads take 10–25 s). */
export type Satellite = {
  current: SceneStats | null
  baseline: SceneStats[]
  ndvi_median: number | null
  ndmi_median: number | null
  ndmi_delta: number | null
  stage: 'pełny łan' | 'wschody/dojrzewanie' | 'poza sezonem'
  assessment: string
  level: 'niższa' | 'nieco niższa' | 'typowa' | 'wyższa' | 'niepewne' | 'brak danych' | 'nie dotyczy'
  n_reference: number
  source: Source
  limitations: string[]
  elapsed_s: number
}

export type WaterMeasure = { id: string; title: string; m3: number; days: number; permanent: boolean; assumptions: string[] }
export type Water = {
  area_m2: number
  rain_year_mm: number
  rain_year_m3: number
  years: string
  use_mm_day: number
  use_m3_day: number
  soil_m3: number | null
  measures: WaterMeasure[]
}

type LatLon = [number, number]
/** Flow model on the GUGiK terrain model: where water runs, leaves and collects. */
export type Runoff = {
  flat: boolean
  step_m: number
  relief_m: number
  arrows: LatLon[][]
  streams: { path: LatLon[]; w: number; on: boolean }[]
  outlets: { lat: number; lon: number; share: number; dir: string }[]
  sinks: { lat: number; lon: number; share: number }[]
  kept_share: number
  inflow_ha: number
  storm_loss_m3: number
  pond: { lat: number; lon: number; catchment_ha: number; storm_mm: number; runoff_coef: number; storm_m3: number; pond_m2: number } | null
  notes: string[]
  area_m2: number
  source: Source
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) {
    // FastAPI errors come as {"detail": "..."}; surface that message to the user
    const text = await res.text()
    let msg = `${res.status} ${res.statusText}`
    try {
      const d = JSON.parse(text).detail
      if (typeof d === 'string') msg = d
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const api = {
  parcelById: (id: string) => request<Parcel>(`/parcels/by-id?id=${encodeURIComponent(id.trim())}&landuse=false`),
  parcelAt: (lat: number, lon: number) => request<Parcel>(`/parcels/at?lat=${lat}&lon=${lon}&landuse=false`),
  landuse: (id: string) => request<LandUse>(`/parcels/landuse?id=${encodeURIComponent(id)}`),
  crops: () => request<Crop[]>('/analysis/crops'),
  geocode: (q: string, full = false) => request<Place[]>(`/geocode?q=${encodeURIComponent(q)}${full ? '&full=true' : ''}`),
  analyse: (parcelId: string, crop: string, date: string) =>
    request<Analysis>(`/analysis?parcel_id=${encodeURIComponent(parcelId)}&crop=${crop}&date=${date}`),
  runoff: (parcelId: string) => request<Runoff>(`/analysis/runoff?parcel_id=${encodeURIComponent(parcelId)}`),
  satellite: (parcelId: string, crop: string, date: string) =>
    request<Satellite>(`/analysis/satellite?parcel_id=${encodeURIComponent(parcelId)}&crop=${crop}&date=${date}`),
}
