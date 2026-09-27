import { useCallback, useEffect, useState } from 'react'
import { GRID_BEARING, offset, type LngLat } from './geo'

export type LocationStatus = 'locating' | 'ok' | 'denied' | 'unavailable'

// Union Square — where the simulator starts.
const SIM_START: LngLat = [-73.9903, 40.7359]
const SIM_STEP_METERS = 15

// Arrow keys move along the rotated grid, so "up" walks up the avenue on screen.
const ARROW_BEARINGS: Record<string, number> = {
  ArrowUp: GRID_BEARING,
  ArrowRight: GRID_BEARING + 90,
  ArrowDown: GRID_BEARING + 180,
  ArrowLeft: GRID_BEARING + 270,
}

/**
 * The player's position. Real GPS by default; with `sim`, arrow keys walk and
 * `moveTo` (wired to map taps) jumps, so the game can be tested at a desk.
 */
export function useGeolocation(sim: boolean) {
  const [position, setPosition] = useState<LngLat | null>(sim ? SIM_START : null)
  const [status, setStatus] = useState<LocationStatus>(() => {
    if (sim) return 'ok'
    return 'geolocation' in navigator ? 'locating' : 'unavailable'
  })

  useEffect(() => {
    if (sim || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition([p.coords.longitude, p.coords.latitude])
        setStatus('ok')
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [sim])

  useEffect(() => {
    if (!sim) return
    const onKey = (e: KeyboardEvent) => {
      const bearing = ARROW_BEARINGS[e.key]
      if (bearing === undefined) return
      e.preventDefault()
      setPosition((p) => p && offset(p, SIM_STEP_METERS, bearing))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  const moveTo = useCallback((p: LngLat) => sim && setPosition(p), [sim])

  return { position, status, moveTo }
}
