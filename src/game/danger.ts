/** How close Pac-Man is, as the screen should feel it. */
export type Danger = 'safe' | 'near' | 'close' | 'critical'

export const DANGER_RANK: Record<Danger, number> = { safe: 0, near: 1, close: 2, critical: 3 }

export function dangerLevel(meters: number | null): Danger {
  if (meters === null || meters >= 200) return 'safe'
  if (meters >= 100) return 'near'
  if (meters >= 50) return 'close'
  return 'critical'
}

// Buzz when danger rises a level (Android only — iOS Safari has no vibration API).
const BUZZ: Record<Danger, number[]> = {
  safe: [],
  near: [200],
  close: [150, 100, 150],
  critical: [400, 100, 400],
}

export function buzz(level: Danger) {
  if (BUZZ[level].length && 'vibrate' in navigator) navigator.vibrate(BUZZ[level])
}
