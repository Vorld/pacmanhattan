import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'
import { mazeStyle } from './mazeStyle'

// MapLibre looks for its worker next to its own file, which Vite's bundling moves.
maplibregl.setWorkerUrl(workerUrl)

// Manhattan's street grid runs ~29° east of true north. Rotating by that makes avenues vertical.
export const GRID_BEARING = 29

const MANHATTAN_BOUNDS: [[number, number], [number, number]] = [
  [-74.06, 40.67],
  [-73.87, 40.9],
]

export default function MazeMap() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: mazeStyle,
      center: [-73.9712, 40.7831],
      zoom: 13,
      bearing: GRID_BEARING,
      pitch: 0,
      maxPitch: 0,
      minZoom: 12,
      maxZoom: 18.5,
      maxBounds: MANHATTAN_BOUNDS,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    if (import.meta.env.DEV) Object.assign(window, { map })
    return () => map.remove()
  }, [])

  // MapLibre's CSS forces the map element to position: relative, so size it via a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      <p className="pointer-events-auto absolute right-2 bottom-1 text-[9px] text-neutral-600">
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ·{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>
      </p>
    </div>
  )
}
