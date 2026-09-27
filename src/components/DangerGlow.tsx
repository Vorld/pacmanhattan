import type { Danger } from '../game/danger'

/** A pulsing glow around the screen edge that gets redder and faster as Pac-Man closes in. */
export default function DangerGlow({ level }: { level: Danger }) {
  if (level === 'safe') return null
  return <div className={`danger-glow danger-${level} pointer-events-none absolute inset-0`} />
}
