/** Curated places, produced by scripts/build-graph.mjs from data/places.json. */
export interface PlaceBase {
  id: string;
  name: string;
  lat: number;
  lon: number;
  neighborhood: string;
  /** Graph node the place was snapped to. */
  node: number;
  snapDistance: number;
}

export interface Landmark extends PlaceBase {
  points: number;
  fact: string;
}

export interface Target extends PlaceBase {
  difficulty: 1 | 2 | 3;
  clue: string;
  /** Hand-written hint facts, vaguest first. */
  facts: string[];
}

export interface PlacesData {
  landmarks: Landmark[];
  targets: Target[];
}
