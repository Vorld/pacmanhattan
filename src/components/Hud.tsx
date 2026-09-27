type Props = {
  /** Meters to Pac-Man, or null before he spawns. */
  distance: number | null
  elapsedMs: number
}

function distanceColor(m: number) {
  if (m < 200) return 'text-blinky border-blinky'
  if (m < 400) return 'text-pac border-pac'
  return 'text-green-400 border-green-400'
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function Hud({ distance, elapsedMs }: Props) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] font-arcade text-[11px]">
      {distance === null ? (
        <span className="animate-blink rounded-full border border-neutral-600 bg-black/80 px-3 py-2 text-neutral-400">
          PAC-MAN…
        </span>
      ) : (
        <span className={`rounded-full border bg-black/80 px-3 py-2 ${distanceColor(distance)}`}>
          ● {Math.round(distance)}m
        </span>
      )}
      <span className="rounded-full bg-black/80 px-3 py-2 text-white">⏱ {clock(elapsedMs)}</span>
    </header>
  )
}
