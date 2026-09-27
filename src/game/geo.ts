import manhattan from './manhattan.json'

// Manhattan's street grid runs ~29° east of true north. Rotating the map by this makes avenues vertical.
export const GRID_BEARING = 29

/** [longitude, latitude] — the same order MapLibre and GeoJSON use. */
export type LngLat = [number, number]

const EARTH_RADIUS = 6371000
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in meters. */
export function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a))
}

/** Move `meters` from `from` toward compass `bearing` (degrees, 0 = north). Fine for short hops. */
export function offset([lng, lat]: LngLat, meters: number, bearing: number): LngLat {
  const b = toRad(bearing)
  const dLat = (meters * Math.cos(b)) / 111320
  const dLng = (meters * Math.sin(b)) / (111320 * Math.cos(toRad(lat)))
  return [lng + dLng, lat + dLat]
}

function inRing([x, y]: LngLat, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function inManhattan(point: LngLat): boolean {
  return (manhattan.coordinates as number[][][][]).some(
    ([outer, ...holes]) => inRing(point, outer) && !holes.some((h) => inRing(point, h)),
  )
}
