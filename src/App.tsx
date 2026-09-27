import { useState } from 'react'
import Game from './components/Game'
import Overlay from './components/Overlay'
import { inManhattan } from './game/geo'
import { useGeolocation } from './game/useGeolocation'

// Blinky until ghost picking lands on the landing screen.
const GHOST_COLOR = '#ff0000'

const sim = new URLSearchParams(window.location.search).has('sim')

export default function App() {
  const { position, status, moveTo } = useGeolocation(sim)
  const offIsland = position !== null && !inManhattan(position)
  const [run, setRun] = useState(0)

  return (
    <main className="relative h-full overflow-hidden">
      <Game
        key={run}
        position={position}
        ready={status === 'ok' && !offIsland}
        ghostColor={GHOST_COLOR}
        onTap={moveTo}
        onPlayAgain={() => setRun((r) => r + 1)}
      />

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
