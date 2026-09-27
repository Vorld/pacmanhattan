import { useEffect, useRef } from 'react'
import { haversine, type LngLat } from './geo'
import type { PacmanFrame } from './usePacman'

// Close enough that the sprites touch on screen.
export const CATCH_METERS = 15
// Pac-Man has to stay this close briefly, so a single GPS blip can't end the game.
const CATCH_HOLD_MS = 1_000
const CHECK_MS = 250

/** Calls `onCaught` once Pac-Man has been within CATCH_METERS of the player for CATCH_HOLD_MS. */
export function useCatch(
  pacmanAt: (now: number) => PacmanFrame | null,
  player: LngLat | null,
  active: boolean,
  onCaught: (at: number) => void,
) {
  const playerRef = useRef(player)
  const onCaughtRef = useRef(onCaught)

  useEffect(() => {
    playerRef.current = player
    onCaughtRef.current = onCaught
  }, [player, onCaught])

  useEffect(() => {
    if (!active) return
    let closeSince: number | null = null
    const id = setInterval(() => {
      const now = Date.now()
      const pacman = pacmanAt(now)
      const p = playerRef.current
      if (!pacman || !p || haversine(pacman.position, p) >= CATCH_METERS) {
        closeSince = null
        return
      }
      closeSince ??= now
      if (now - closeSince >= CATCH_HOLD_MS) onCaughtRef.current(now)
    }, CHECK_MS)
    return () => clearInterval(id)
  }, [active, pacmanAt])
}
