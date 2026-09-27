import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import { GRID_BEARING, type LngLat } from '../game/geo'
import { mazeStyle } from './mazeStyle'
import { ghostSvg } from './sprites'

// MapLibre looks for its worker next to its own file, which Vite's bundling moves.
maplibregl.setWorkerUrl(workerUrl)

const MANHATTAN_BOUNDS: [[number, number], [number, number]] = [
  [-74.06, 40.67],
  [-73.87, 40.9],
]

// Close enough to read street names while playing.
const PLAY_ZOOM = 16.5

type Props = {
  player: LngLat | null
  trail: LngLat[]
  ghostColor: string
  onTap?: (point: LngLat) => void
}

export default function MazeMap({ player, trail, ghostColor, onTap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const ghostRef = useRef<maplibregl.Marker | null>(null)
  const followingRef = useRef(false)
  const onTapRef = useRef(onTap)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    onTapRef.current = onTap
  }, [onTap])

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
      keyboard: false,
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    const ghostEl = document.createElement('div')
    ghostEl.className = 'ghost-marker'
    ghostRef.current = new maplibregl.Marker({ element: ghostEl })
    map.on('load', () => setLoaded(true))
    map.on('click', (e) => onTapRef.current?.([e.lngLat.lng, e.lngLat.lat]))
    mapRef.current = map
    if (import.meta.env.DEV) Object.assign(window, { map })
    return () => {
      map.remove()
      mapRef.current = null
      ghostRef.current = null
      followingRef.current = false
    }
  }, [])

  // Ghost marker + camera follow.
  useEffect(() => {
    const map = mapRef.current
    const ghost = ghostRef.current
    if (!map || !ghost || !player) return
    ghost.setLngLat(player)
    if (!followingRef.current) {
      ghost.addTo(map)
      map.jumpTo({ center: player, zoom: PLAY_ZOOM })
      followingRef.current = true
    } else {
      map.easeTo({ center: player, duration: 400 })
    }
  }, [player])

  useEffect(() => {
    const el = ghostRef.current?.getElement()
    if (el) {
      el.innerHTML = ghostSvg(ghostColor)
      el.style.setProperty('--ghost', ghostColor)
    }
    const map = mapRef.current
    if (!map || !loaded) return
    map.setPaintProperty('trail', 'line-color', ghostColor)
    map.setPaintProperty('trail-glow', 'line-color', ghostColor)
  }, [ghostColor, loaded])

  useEffect(() => {
    const source = mapRef.current?.getSource<maplibregl.GeoJSONSource>('trail')
    if (!loaded || !source) return
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: trail },
    })
  }, [trail, loaded])

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
