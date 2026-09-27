import type { ReactNode } from 'react'
import Hud from './components/Hud'
import { haversine, inManhattan } from './game/geo'
import { useGeolocation } from './game/useGeolocation'
import { useNow } from './game/useNow'
import { usePacman } from './game/usePacman'
import MazeMap from './map/MazeMap'

// Blinky until ghost picking lands on the landing screen.
const GHOST_COLOR = '#ff0000'

const sim = new URLSearchParams(window.location.search).has('sim')

export default function App() {
  const { position, status, moveTo } = useGeolocation(sim)
  const offIsland = position !== null && !inManhattan(position)
  const { pacmanAt, startedAt } = usePacman(position, status === 'ok' && !offIsland)
  const now = useNow(250)
  const pacman = pacmanAt(now)
  const distance = pacman && position ? haversine(pacman.position, position) : null

  return (
    <main className="relative h-full overflow-hidden">
      <MazeMap player={position} ghostColor={GHOST_COLOR} pacmanAt={pacmanAt} onTap={moveTo} />

      <Hud distance={distance} elapsedMs={startedAt ? now - startedAt : 0} />
      {sim && (
        <p className="pointer-events-none absolute bottom-2 left-3 font-arcade text-[10px] text-inky">SIM</p>
      )}

      {status === 'locating' && (
        <Overlay title="FINDING YOU…" blink>
          Pac-Man needs to know where you are.
        </Overlay>
      )}
      {status === 'denied' && (
        <Overlay title="LOCATION BLOCKED">
          PACMANhattan needs your location to play. Allow location access for this site in your browser settings, then
          reload.
        </Overlay>
      )}
      {status === 'unavailable' && (
        <Overlay title="CAN'T FIND YOU">
          Your location isn't coming through. Check that location services are on, then reload.
        </Overlay>
      )}
      {status === 'ok' && offIsland && (
        <Overlay title="HEAD TO MANHATTAN">The whole island is the board. Come find us to play.</Overlay>
      )}
    </main>
  )
}

function Overlay({ title, blink, children }: { title: string; blink?: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/75 px-8 text-center">
      <h2 className={`font-arcade text-base leading-relaxed text-pac glow-maze ${blink ? 'animate-blink' : ''}`}>
        {title}
      </h2>
      <p className="max-w-xs text-sm leading-relaxed text-neutral-300">{children}</p>
    </div>
  )
}
