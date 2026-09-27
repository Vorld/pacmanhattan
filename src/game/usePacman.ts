import { useCallback, useEffect, useRef, useState } from 'react'
import { bearing, haversine, type LngLat } from './geo'
import { fetchRoute, makeRoute, PACMAN_SPEED, pointAlong, spawnPoint, type Route } from './pacman'

// Re-route as soon as the player has moved this far from where Pac-Man is heading…
const MOVED_METERS = 15
// …or he's about to run out of path, so he never stands still…
const LOW_ROUTE_METERS = 20
// …but no more often than this (the routing server asks for fair use).
const MIN_REROUTE_MS = 2_000
// And refresh anyway every so often, in case a better path opened up.
const REROUTE_MS = 10_000
const CHECK_MS = 500
// Within this range he just comes straight at you — the router could detour via another street.
const DIRECT_METERS = 40
// Face a point this far ahead, so tiny route segments don't make him flip around.
const LOOKAHEAD_METERS = 10

type Leg = { route: Route; startedAt: number; target: LngLat }

export type PacmanFrame = { position: LngLat; heading: number; route: Route; traveled: number }

/**
 * Pac-Man walks `route` from the moment it was requested, so his position is
 * always derived from the clock — a locked phone or a slow frame never desyncs him.
 */
export function usePacman(player: LngLat | null, active: boolean) {
  const leg = useRef<Leg | null>(null)
  const playerRef = useRef(player)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  useEffect(() => {
    playerRef.current = player
  }, [player])

  const pacmanAt = useCallback((now: number): PacmanFrame | null => {
    const l = leg.current
    if (!l) return null
    const traveled = Math.min(PACMAN_SPEED * Math.max(0, (now - l.startedAt) / 1000), l.route.length)
    const { point, heading: segment } = pointAlong(l.route, traveled)
    const ahead = pointAlong(l.route, traveled + LOOKAHEAD_METERS).point
    const heading = haversine(point, ahead) > 1 ? bearing(point, ahead) : segment
    return { position: point, heading, route: l.route, traveled }
  }, [])

  const hasPlayer = player !== null

  useEffect(() => {
    if (!active || !hasPlayer) return
    const controller = new AbortController()
    let inFlight = false

    async function routeFrom(from: LngLat) {
      const to = playerRef.current
      if (!to || inFlight) return
      inFlight = true
      const requestedAt = Date.now()
      try {
        const route =
          haversine(from, to) < DIRECT_METERS ? makeRoute([from, to]) : await fetchRoute(from, to, controller.signal)
        leg.current = { route, startedAt: requestedAt, target: to }
      } catch {
        // aborted
      } finally {
        inFlight = false
      }
    }

    async function spawn() {
      const from = await spawnPoint(playerRef.current!)
      if (controller.signal.aborted) return
      await routeFrom(from)
      if (!controller.signal.aborted) setStartedAt(Date.now())
    }

    if (!leg.current) spawn()
    const timer = setInterval(() => {
      const now = Date.now()
      const frame = pacmanAt(now)
      const l = leg.current
      const to = playerRef.current
      if (!frame || !l || !to) return
      const age = now - l.startedAt
      const moved = haversine(l.target, to) >= MOVED_METERS
      const runningOut = frame.route.length - frame.traveled < LOW_ROUTE_METERS
      if (age >= REROUTE_MS || (age >= MIN_REROUTE_MS && (moved || runningOut))) routeFrom(frame.position)
    }, CHECK_MS)

    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [active, hasPlayer, pacmanAt])

  return { pacmanAt, startedAt }
}
