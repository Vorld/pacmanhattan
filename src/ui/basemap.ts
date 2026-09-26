import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre builds its worker URL at runtime, which bundlers can't follow.
// Bundle the worker ourselves and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GameConfig } from '../engine/config';
import { GRID_BEARING_DEG, toLonLat } from '../engine/geo';
import type { StreetGraph } from '../engine/graph';

/** Used when the remote style can't be loaded: the street graph alone is still playable. */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#02030a' } }],
};

// Arcade restyle of the dark base map: navy blocks with neon-blue outlines.
const PAINT: [string, string, unknown][] = [
  ['background', 'background-color', '#02030a'],
  ['water', 'fill-color', '#04142b'],
  ['landuse_park', 'fill-color', '#06200f'],
  ['landcover_wood', 'fill-color', '#06200f'],
  ['building', 'fill-color', '#0b1238'],
  ['building', 'fill-outline-color', '#3a5cff'],
];
const HIDDEN = ['road_oneway', 'road_oneway_opposite'];

/**
 * The visual map layer. It never affects movement: the street graph is the
 * only source of truth for where the ghost and Pac-Man can go.
 */
maplibregl.setWorkerUrl(workerUrl);

export class BaseMap {
  private constructor(readonly map: maplibregl.Map) {}

  static async create(container: HTMLElement, cfg: GameConfig, graph: StreetGraph): Promise<BaseMap> {
    const map = new maplibregl.Map({
      container,
      style: await loadStyle(cfg.map.styleUrl),
      center: [-73.9855, 40.758],
      zoom: cfg.zoom.initial,
      minZoom: cfg.zoom.min,
      maxZoom: cfg.zoom.max,
      bearing: GRID_BEARING_DEG,
      pitch: 0,
      maxPitch: 0,
      dragPan: false,
      dragRotate: false,
      keyboard: false,
      doubleClickZoom: false,
      boxZoom: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    map.scrollZoom.enable({ around: 'center' });
    map.touchZoomRotate.enable({ around: 'center' });
    map.touchZoomRotate.disableRotation();
    await new Promise<void>((resolve) => map.once('load', () => resolve()));
    const base = new BaseMap(map);
    base.addStreets(graph);
    return base;
  }

  /** Draw the walkable graph so players see exactly where they can go. */
  private addStreets(graph: StreetGraph) {
    const features = graph.edges.map((e) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: Array.from(e.xs, (x, i) => toLonLat(x, e.ys[i])),
      },
    }));
    this.map.addSource('walkable', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    const beforeLabels = this.map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    this.map.addLayer(
      {
        id: 'walkable',
        type: 'line',
        source: 'walkable',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#1d2c75',
          'line-opacity': 0.9,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 3, 18, 14],
        },
      },
      beforeLabels,
    );
  }

  follow(lonLat: [number, number]) {
    this.map.jumpTo({ center: lonLat });
  }

  project(lonLat: [number, number]) {
    return this.map.project(lonLat);
  }

  zoomBy(delta: number) {
    this.map.easeTo({ zoom: this.map.getZoom() + delta, duration: 200 });
  }
}

async function loadStyle(url: string): Promise<StyleSpecification> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const style = (await res.json()) as StyleSpecification;
    for (const layer of style.layers) {
      if (HIDDEN.includes(layer.id)) layer.layout = { ...layer.layout, visibility: 'none' };
      // Patterns reference sprite images we don't need; plain fills read better at game zoom.
      if (layer.paint && 'fill-pattern' in layer.paint) delete (layer.paint as Record<string, unknown>)['fill-pattern'];
      for (const [id, prop, value] of PAINT) {
        if (layer.id === id) Object.assign(layer, { paint: { ...layer.paint, [prop]: value } });
      }
    }
    return style;
  } catch (err) {
    console.warn('Base map style unavailable, using plain background', err);
    return FALLBACK_STYLE;
  }
}
