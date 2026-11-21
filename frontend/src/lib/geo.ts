/** Point-in-polygon (ray casting) for GeoJSON Polygon / MultiPolygon in lon/lat. Holes are respected. */
export function containsPoint(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon, lat: number, lon: number): boolean {
  const inRing = (ring: GeoJSON.Position[]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  const inPolygon = (rings: GeoJSON.Position[][]) => inRing(rings[0]) && !rings.slice(1).some(inRing)
  return geom.type === 'Polygon' ? inPolygon(geom.coordinates) : geom.coordinates.some(inPolygon)
}
