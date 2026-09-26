import { toGrid, toXY, type Vec } from './geo';
import type { StreetGraph } from './graph';
import type { Landmark, Target } from './places';

export type HintKind = 'zone' | 'bearing' | 'neighborhood' | 'fact' | 'street';

/**
 * Order hints are revealed in, one per landmark visit. Bearing hints are
 * relative to the landmark just reached, so they recur as the ghost moves.
 * Once the list is used up, further visits give fresh bearings.
 */
export const HINT_SEQUENCE: HintKind[] = ['zone', 'bearing', 'neighborhood', 'fact', 'bearing', 'street', 'fact'];

export interface Hint {
  kind: HintKind;
  text: string;
  /** Landmark the hint was earned at. */
  landmarkId: string;
}

// Zone boundaries, measured along the grid's uptown axis at real crossings.
const uptown = (lon: number, lat: number) => toGrid(toXY(lon, lat)).v;
const ZONES: { below: number; name: string }[] = [
  { below: uptown(-74.002, 40.719), name: 'Lower Manhattan, below Canal Street' },
  { below: uptown(-73.9941, 40.7354), name: 'downtown, between Canal Street and 14th Street' },
  { below: uptown(-73.9732, 40.7644), name: 'Midtown, between 14th Street and 59th Street' },
  { below: uptown(-73.9496, 40.7967), name: 'uptown, between 59th Street and 110th Street' },
  { below: Infinity, name: 'Harlem or northern Manhattan, above 110th Street' },
];

export function zoneOf(p: Vec): string {
  const v = toGrid(p).v;
  return ZONES.find((z) => v < z.below)!.name;
}

/** Direction in Manhattan terms: uptown/downtown along the avenues, east/west across them. */
export function gridDirection(from: Vec, to: Vec): string {
  const a = toGrid(from);
  const b = toGrid(to);
  const angle = (Math.atan2(b.u - a.u, b.v - a.v) * 180) / Math.PI; // 0 = uptown, 90 = east
  const names = ['uptown', 'uptown and east', 'east, crosstown', 'downtown and east', 'downtown', 'downtown and west', 'west, crosstown', 'uptown and west'];
  return names[(Math.round(angle / 45) + 8) % 8];
}

export function distanceBand(meters: number): string {
  if (meters < 500) return 'less than 500 m away';
  if (meters < 1000) return 'between 500 m and 1 km away';
  if (meters < 2000) return 'between 1 and 2 km away';
  if (meters < 4000) return 'between 2 and 4 km away';
  return 'more than 4 km away';
}

/** Named streets touching the target's node, for the street hint. */
export function streetsAt(g: StreetGraph, node: number): string[] {
  const names = new Set<string>();
  for (const exit of g.exits[node]) {
    const name = g.edges[exit.edge].name;
    if (name) names.add(name);
  }
  // Mid-block places have one named street; widen to the next intersections.
  if (names.size === 0) {
    for (const exit of g.exits[node]) {
      const other = g.otherEnd(exit.edge, node);
      for (const x of g.exits[other]) if (g.edges[x.edge].name) names.add(g.edges[x.edge].name);
    }
  }
  return [...names];
}

export function makeHint(
  kind: HintKind,
  g: StreetGraph,
  target: Target,
  at: Landmark,
  factIndex: number,
): Hint {
  const targetPos = g.nodePos(target.node);
  const atPos = g.nodePos(at.node);
  let text: string;
  switch (kind) {
    case 'zone':
      text = `The target is in ${zoneOf(targetPos)}.`;
      break;
    case 'bearing': {
      const d = Math.hypot(targetPos.x - atPos.x, targetPos.y - atPos.y);
      text = `From ${at.name}, the target is ${gridDirection(atPos, targetPos)}, ${distanceBand(d)}.`;
      break;
    }
    case 'neighborhood':
      text = `The target is in ${target.neighborhood}.`;
      break;
    case 'street': {
      const streets = streetsAt(g, target.node);
      text = streets.length
        ? `The target is on or next to ${streets.slice(0, 2).join(' / ')}.`
        : `The target is in ${target.neighborhood}.`;
      break;
    }
    case 'fact':
      text = target.facts[factIndex] ?? target.facts[target.facts.length - 1];
      break;
  }
  return { kind, text, landmarkId: at.id };
}

/** The hint earned for the `index`-th landmark visit of a run. */
export function hintForVisit(index: number, g: StreetGraph, target: Target, at: Landmark): Hint {
  const kind = HINT_SEQUENCE[index] ?? 'bearing';
  const factIndex = HINT_SEQUENCE.slice(0, index).filter((k) => k === 'fact').length;
  return makeHint(kind, g, target, at, factIndex);
}
