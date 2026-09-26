import { readFileSync } from 'node:fs';
import { StreetGraph, type GraphData } from '../src/engine/graph';
import type { PlacesData } from '../src/engine/places';
import { toLonLat } from '../src/engine/geo';

export function loadManhattan() {
  const graph = new StreetGraph(JSON.parse(readFileSync('public/data/manhattan-graph.json', 'utf8')) as GraphData);
  const places = JSON.parse(readFileSync('public/data/places.json', 'utf8')) as PlacesData;
  return { graph, places };
}

/** Small synthetic graph from node coordinates in meters and [a, b] edges. */
export function tinyGraph(nodes: [number, number][], edges: [number, number][]): StreetGraph {
  return new StreetGraph({
    city: 'test',
    nodes: nodes.flatMap(([x, y]) => toLonLat(x, y)),
    edges: edges.map(([a, b]) => [a, b, 0, []]),
    names: [''],
  });
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
