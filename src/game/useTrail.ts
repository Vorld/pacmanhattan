import { useState } from 'react'
import { haversine, type LngLat } from './geo'

// Ignore tiny moves so GPS jitter while standing still doesn't scribble.
const MIN_STEP_METERS = 8

/** Everywhere the player has been, as a list of points. */
export function useTrail(position: LngLat | null) {
  const [trail, setTrail] = useState<LngLat[]>([])
  const [seen, setSeen] = useState<LngLat | null>(null)

  // Extend the trail during render when the position changes (no effect needed).
  if (position !== seen) {
    setSeen(position)
    const last = trail[trail.length - 1]
    if (position && (!last || haversine(last, position) >= MIN_STEP_METERS)) setTrail([...trail, position])
  }

  return trail
}
