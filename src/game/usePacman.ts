import { useCallback, useEffect, useRef, useState } from 'react'
import { bearing, haversine, type LngLat } from './geo'
import { fetchRoute, PACMAN_SPEED, pointAlong, spawnPoint, type Route } from './pacman'

const REROUTE_MS = 10_000
// Also re-route early when he's about to run out of path, so he never stands still.
const LOW_ROUTE_METERS = 20
const CHECK_MS = 2_000
// Face a point this far ahead, so tiny route segments don't make him flip around.
const LOOKAHEAD_METERS = 10

type Leg = { route: Route; startedAt: number }

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
        const route = await fetchRoute(from, to, controller.signal)
        leg.current = { route, startedAt: requestedAt }
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
      if (!frame || !leg.current) return
      const stale = now - leg.current.startedAt >= REROUTE_MS
      const runningOut = frame.route.length - frame.traveled < LOW_ROUTE_METERS
      if (stale || runningOut) routeFrom(frame.position)
    }, CHECK_MS)

    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [active, hasPlayer, pacmanAt])

  return { pacmanAt, startedAt }
}
