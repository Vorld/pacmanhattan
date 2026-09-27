import MazeMap from './map/MazeMap'

export default function App() {
  return (
    <main className="relative h-full overflow-hidden">
      <MazeMap />
      <h1 className="pointer-events-none absolute top-4 left-4 font-arcade text-xs text-pac glow-maze">
        PACMANhattan
      </h1>
    </main>
  )
}
