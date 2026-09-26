// Local planar projection for Manhattan. Game logic works in meters:
// x grows east, y grows north. Error is well under 1% across the island.
export const LAT0 = 40.78;
export const LON0 = -73.97;
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

/** Manhattan's street grid is rotated ~29° clockwise from true north. */
export const GRID_BEARING_DEG = 29;
const B = (GRID_BEARING_DEG * Math.PI) / 180;

export interface Vec {
  x: number;
  y: number;
}

export function toXY(lon: number, lat: number): Vec {
  return { x: (lon - LON0) * M_PER_DEG_LON, y: (lat - LAT0) * M_PER_DEG_LAT };
}

export function toLonLat(x: number, y: number): [number, number] {
  return [x / M_PER_DEG_LON + LON0, y / M_PER_DEG_LAT + LAT0];
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

/** Angle between two vectors in degrees (0–180). */
export function angleBetween(a: Vec, b: Vec): number {
  const c = dot(normalize(a), normalize(b));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** World-space unit vectors for screen directions, with the map rotated to the grid. */
export const SCREEN_DIRS = {
  up: { x: Math.sin(B), y: Math.cos(B) },
  down: { x: -Math.sin(B), y: -Math.cos(B) },
  right: { x: Math.cos(B), y: -Math.sin(B) },
  left: { x: -Math.cos(B), y: Math.sin(B) },
} satisfies Record<string, Vec>;

export type ScreenDir = keyof typeof SCREEN_DIRS;

/** Grid coordinates: u = crosstown (east side positive), v = uptown. */
export function toGrid(p: Vec): { u: number; v: number } {
  return { u: p.x * Math.cos(B) - p.y * Math.sin(B), v: p.x * Math.sin(B) + p.y * Math.cos(B) };
}
