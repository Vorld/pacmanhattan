import { useCallback, useEffect, useState } from 'react'
import { haversine, pathLength, type LngLat } from '../game/geo'
import { useCatch } from '../game/useCatch'
import { useNow } from '../game/useNow'
import { usePacman } from '../game/usePacman'
import { useTrail } from '../game/useTrail'
import MazeMap from '../map/MazeMap'
import GameOver from './GameOver'
import Hud from './Hud'
import QuitButton from './QuitButton'

// How long "CAUGHT!" stays up before the game-over screen.
const CAUGHT_MS = 2_000
// Readings arrive ~1–2m apart when walking; a bigger single jump is a GPS gap (e.g. the subway).
const MAX_WALK_STEP_METERS = 50

type Ending = { at: number; caught: boolean }

type Props = {
  position: LngLat | null
  /** Location is known and on the island. */
  ready: boolean
  ghostColor: string
  onTap?: (point: LngLat) => void
  onPlayAgain: () => void
}

/** One run of the game. Re-mount (new `key`) to start fresh. */
export default function Game({ position, ready, ghostColor, onTap, onPlayAgain }: Props) {
  const [ending, setEnding] = useState<Ending | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const playing = ending === null
  const endedAt = ending?.at ?? null

  const { pacmanAt: livePacmanAt, startedAt } = usePacman(position, ready && playing)
  // Once the run ends, time stops: Pac-Man freezes where he was.
  const pacmanAt = useCallback(
    (now: number) => livePacmanAt(endedAt === null ? now : Math.min(now, endedAt)),
    [livePacmanAt, endedAt],
  )

  const trail = useTrail(playing ? position : null)
  const now = useNow(250)
  const clock = endedAt ?? now
  const pacman = pacmanAt(clock)
  const distance = pacman && position ? haversine(pacman.position, position) : null

  useCatch(pacmanAt, position, playing && startedAt !== null, (at) => setEnding((e) => e ?? { at, caught: true }))

  useEffect(() => {
    if (!ending?.caught) return
    const id = setTimeout(() => setShowSummary(true), CAUGHT_MS)
    return () => clearTimeout(id)
  }, [ending])

  const quit = () => {
    setEnding({ at: Date.now(), caught: false })
    setShowSummary(true)
  }

  return (
    <>
      <MazeMap player={position} ghostColor={ghostColor} pacmanAt={pacmanAt} onTap={playing ? onTap : undefined} />

      {!showSummary && <Hud distance={distance} elapsedMs={startedAt ? clock - startedAt : 0} />}
      {playing && ready && <QuitButton onQuit={quit} />}

      {ending?.caught && !showSummary && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <h2 className="animate-blink font-arcade text-4xl text-pac [text-shadow:0_0_12px_var(--color-blinky),0_0_32px_var(--color-blinky)]">
            CAUGHT!
          </h2>
        </div>
      )}
      {ending && showSummary && (
        <GameOver
          caught={ending.caught}
          survivedMs={startedAt ? ending.at - startedAt : 0}
          walkedMeters={pathLength(trail, MAX_WALK_STEP_METERS)}
          onPlayAgain={onPlayAgain}
        />
      )}
    </>
  )
}
