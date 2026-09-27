import { bearing, haversine, inManhattan, offset, type LngLat } from './geo'

export const PACMAN_SPEED = 4000 / 3600 // 4 km/h in m/s
export const SPAWN_DISTANCE = 800

const OSRM = 'https://routing.openstreetmap.de/routed-foot'

/** A walking path plus the running distance (m) at each vertex, for fast lookups. */
export type Route = { coords: LngLat[]; cum: number[]; length: number }

export function makeRoute(coords: LngLat[]): Route {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]))
  return { coords, cum, length: cum[cum.length - 1] }
}

/** The point `meters` along the route (clamped to its ends) and the compass heading there. */
export function pointAlong(route: Route, meters: number): { point: LngLat; heading: number } {
  const { coords, cum } = route
  if (coords.length < 2) return { point: coords[0], heading: 0 }
  const d = Math.max(0, Math.min(meters, route.length))
  let i = 1
  while (i < cum.length - 1 && cum[i] < d) i++
  const [a, b] = [coords[i - 1], coords[i]]
  const seg = cum[i] - cum[i - 1]
  const t = seg > 0 ? (d - cum[i - 1]) / seg : 0
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) }
}

/** Evenly spaced pellets along the route that Pac-Man hasn't reached yet. */
export function dotsAhead(route: Route, traveled: number, spacing: number): LngLat[] {
  const dots: LngLat[] = []
  for (let d = Math.ceil(traveled / spacing) * spacing; d < route.length; d += spacing) {
    dots.push(pointAlong(route, d).point)
  }
  return dots
}

/**
 * Walking route from → to. It ends exactly on `to` (a short final approach off the street),
 * so Pac-Man actually reaches the player instead of stopping at the nearest road.
 * Falls back to a straight line if routing is down.
 */
export async function fetchRoute(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route> {
  try {
    const url = `${OSRM}/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal })
    const data = await res.json()
    const coords: LngLat[] | undefined = data.routes?.[0]?.geometry?.coordinates
    if (coords && coords.length >= 2) return makeRoute([from, ...coords, to])
  } catch (err) {
    if (signal?.aborted) throw err
  }
  return makeRoute([from, to])
}

/** The nearest walkable street point, or the input if routing is down. */
export async function snapToStreet(p: LngLat): Promise<LngLat> {
  try {
    const res = await fetch(`${OSRM}/nearest/v1/driving/${p.join(',')}?number=1`)
    const loc: LngLat | undefined = (await res.json()).waypoints?.[0]?.location
    if (loc) return loc
  } catch {
    // fall through
  }
  return p
}

/** A street point ~`distance` from the player, on Manhattan (not in the river). */
export async function spawnPoint(player: LngLat, distance = SPAWN_DISTANCE): Promise<LngLat> {
  const start = Math.random() * 360
  const candidates = Array.from({ length: 12 }, (_, i) => offset(player, distance, start + i * 30)).filter(inManhattan)
  for (const c of candidates.slice(0, 3)) {
    const snapped = await snapToStreet(c)
    if (inManhattan(snapped)) return snapped
  }
  return candidates[0] ?? offset(player, distance, start)
}
