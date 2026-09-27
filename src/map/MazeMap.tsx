import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import { GRID_BEARING, haversine, type LngLat } from '../game/geo'
import { dotsAhead, type Route } from '../game/pacman'
import type { PacmanFrame } from '../game/usePacman'
import { mazeStyle } from './mazeStyle'
import { ghostSvg, pacmanSvg } from './sprites'

// MapLibre looks for its worker next to its own file, which Vite's bundling moves.
maplibregl.setWorkerUrl(workerUrl)

const MANHATTAN_BOUNDS: [[number, number], [number, number]] = [
  [-74.06, 40.67],
  [-73.87, 40.9],
]

// Close enough to read street names while playing.
const PLAY_ZOOM = 16.5
// How long the ghost takes to slide to a new GPS fix (~ the GPS update interval).
const GLIDE_MS = 1000
const DOT_SPACING_METERS = 15
// Trail corners closer than this are merged, so standing still doesn't pile up points.
const TRAIL_STEP_METERS = 2

type Props = {
  player: LngLat | null
  ghostColor: string
  pacmanAt: (now: number) => PacmanFrame | null
  onTap?: (point: LngLat) => void
}

type Glide = { from: LngLat; to: LngLat; t0: number; done?: boolean }

const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export default function MazeMap({ player, ghostColor, pacmanAt, onTap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const ghostRef = useRef<maplibregl.Marker | null>(null)
  const glide = useRef<Glide | null>(null)
  // The trail is drawn from where the ghost has actually been drawn, so it never runs ahead of it.
  const drawnTrail = useRef<LngLat[]>([])
  const onTapRef = useRef(onTap)
  const pacmanAtRef = useRef(pacmanAt)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    onTapRef.current = onTap
    pacmanAtRef.current = pacmanAt
  }, [onTap, pacmanAt])

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
    map.on('load', () => setLoaded(true))
    map.on('click', (e) => onTapRef.current?.([e.lngLat.lng, e.lngLat.lat]))
    mapRef.current = map
    if (import.meta.env.DEV) Object.assign(window, { map, pacmanAtRef })

    const ghostEl = document.createElement('div')
    ghostEl.className = 'ghost-marker'
    const ghost = new maplibregl.Marker({ element: ghostEl })
    ghostRef.current = ghost

    const pacEl = document.createElement('div')
    pacEl.className = 'pacman-marker'
    pacEl.innerHTML = `<div class="pacman-facing">${pacmanSvg()}</div>`
    const facing = pacEl.firstElementChild as HTMLElement
    const pacman = new maplibregl.Marker({ element: pacEl })

    // Per-frame render: glide the ghost (camera locked to it), walk Pac-Man, eat dots.
    let raf = 0
    let lastDots: { route: Route; eaten: number } | null = null
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = Date.now()

      const g = glide.current
      if (g && !g.done) {
        const t = Math.min(1, (now - g.t0) / GLIDE_MS)
        const pos = lerp(g.from, g.to, t)
        ghost.setLngLat(pos)
        map.jumpTo({ center: pos })
        map.getSource<maplibregl.GeoJSONSource>('trail')?.setData({
          type: 'LineString',
          coordinates: [...drawnTrail.current, pos],
        })
        g.done = t === 1
      }

      const p = pacmanAtRef.current(now)
      if (!p) return
      pacman.setLngLat(p.position)
      if (!pacman.getElement().isConnected) pacman.addTo(map)
      // The sprite faces east (90°); the map is rotated by GRID_BEARING.
      facing.style.transform = `rotate(${p.heading - 90 - GRID_BEARING}deg)`

      const eaten = Math.floor(p.traveled / DOT_SPACING_METERS)
      if (lastDots?.route !== p.route || lastDots.eaten !== eaten) {
        lastDots = { route: p.route, eaten }
        map.getSource<maplibregl.GeoJSONSource>('dots')?.setData({
          type: 'MultiPoint',
          coordinates: dotsAhead(p.route, p.traveled, DOT_SPACING_METERS),
        })
      }
    }
    map.once('load', () => {
      raf = requestAnimationFrame(frame)
    })

    return () => {
      cancelAnimationFrame(raf)
      map.remove()
      mapRef.current = null
      ghostRef.current = null
      glide.current = null
      drawnTrail.current = []
    }
  }, [])

  // New GPS fix: start gliding from wherever the ghost is drawn now.
  useEffect(() => {
    const map = mapRef.current
    const ghost = ghostRef.current
    if (!map || !ghost || !player) return
    if (!glide.current) {
      ghost.setLngLat(player).addTo(map)
      map.jumpTo({ center: player, zoom: PLAY_ZOOM })
      map.dragPan.disable() // the camera follows you from here on
      glide.current = { from: player, to: player, t0: Date.now() }
      return
    }
    const { lng, lat } = ghost.getLngLat()
    const drawn: LngLat = [lng, lat]
    const trail = drawnTrail.current
    if (!trail.length || haversine(trail[trail.length - 1], drawn) >= TRAIL_STEP_METERS) trail.push(drawn)
    glide.current = { from: drawn, to: player, t0: Date.now() }
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
