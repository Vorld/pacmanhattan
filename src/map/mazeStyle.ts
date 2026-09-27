import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'
import type { MultiPolygon } from 'geojson'
import manhattan from '../game/manhattan.json'

const MAZE = '#2121ff'
const LABEL = '#8a8aa8'

type Ring = number[][]

function signedArea(ring: Ring) {
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return s / 2
}

// A big box with Manhattan cut out of it, used to dim everything off-island.
const outer: Ring = [
  [-75, 40],
  [-73, 40],
  [-73, 42],
  [-75, 42],
  [-75, 40],
]
const holes = (manhattan.coordinates as Ring[][]).map((poly) => {
  const ring = poly[0]
  return signedArea(ring) > 0 ? [...ring].reverse() : ring
})
const offIsland = {
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'Polygon' as const, coordinates: [outer, ...holes] },
}

// Avenues are a bit wider than side streets.
const classScale: ExpressionSpecification = [
  'match',
  ['get', 'class'],
  ['motorway', 'trunk', 'primary'],
  1.4,
  ['secondary', 'tertiary'],
  1.2,
  1,
]

// Widths in px at z12 and z18; exponential base 2 keeps them proportional to the ground.
function width(atZ12: number, atZ18: number): ExpressionSpecification {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    12,
    ['*', atZ12, classScale],
    18,
    ['*', atZ18, classScale],
  ]
}

const streets: ExpressionSpecification = [
  'all',
  ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
  ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
  ['!=', ['get', 'brunnel'], 'tunnel'],
]

const round = { 'line-cap': 'round', 'line-join': 'round' } as const

export const mazeStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    offIsland: { type: 'geojson', data: offIsland },
    manhattan: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: manhattan as MultiPolygon } },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#000' } },
    {
      id: 'park',
      type: 'fill',
      source: 'omt',
      'source-layer': 'park',
      paint: { 'fill-color': '#06140c' },
    },
    {
      id: 'street-glow',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: streets,
      layout: round,
      paint: { 'line-color': MAZE, 'line-width': width(2, 44), 'line-blur': width(2, 12), 'line-opacity': 0.35 },
    },
    {
      id: 'street-wall',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: streets,
      layout: round,
      paint: { 'line-color': MAZE, 'line-width': width(1, 36) },
    },
    {
      id: 'street-corridor',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: streets,
      layout: round,
      paint: { 'line-color': '#000', 'line-width': width(0, 31) },
    },
    {
      id: 'street-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 15,
      filter: ['match', ['get', 'class'], ['trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 9, 18, 12],
        'text-letter-spacing': 0.05,
      },
      paint: { 'text-color': LABEL, 'text-halo-color': '#000', 'text-halo-width': 1.5 },
    },
    {
      id: 'off-island',
      type: 'fill',
      source: 'offIsland',
      paint: { 'fill-color': '#000', 'fill-opacity': 0.82 },
    },
    {
      id: 'shore-glow',
      type: 'line',
      source: 'manhattan',
      layout: round,
      paint: { 'line-color': MAZE, 'line-width': 8, 'line-blur': 6, 'line-opacity': 0.6 },
    },
    {
      id: 'shore',
      type: 'line',
      source: 'manhattan',
      layout: round,
      paint: { 'line-color': MAZE, 'line-width': 2 },
    },
  ],
}
