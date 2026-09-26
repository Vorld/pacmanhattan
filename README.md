# Pac-Manhattan

A browser game where you play a ghost fleeing Pac-Man through the real streets of Manhattan. Each run gives you one vague clue about a secret place ("Find the station where the ceiling shows the stars"). Visiting landmarks earns points and hints that narrow the target down. Getting caught ends the run.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine + data integrity tests
npm run build      # static site in dist/
```

Controls: arrow keys / WASD (swipe on touch screens) queue a turn for the next corner, `P`/`Esc` pauses, `M` mutes, scroll or pinch to zoom.

## How it's built

```
data/places.json              curated landmarks (45) and targets (18), hand-written
scripts/fetch-osm.mjs         downloads Manhattan's walkable ways from Overpass -> data/raw/ (gitignored)
scripts/build-graph.mjs       raw OSM -> public/data/manhattan-graph.json + places.json
public/config.json            all balance tuning (speeds, reaction delay, scoring, zoom)
src/engine/                   pure game logic, no DOM, fully tested
  graph.ts                    street graph, spatial index, geometry along edges
  movement.ts                 arcade movement: queued turns at intersections, stop at walls
  pathfinding.ts              A* between points that can sit mid-block
  run.ts                      one play-through: spawns, chase, arrivals, hints, discovery
  hints.ts, scoring.ts        hint generation, score + local high scores
src/ui/                       MapLibre base map, canvas overlay, minimap, replay, input, audio
src/analytics.ts              run_start / landmark_visit / hint_shown / caught / target_found
```

**Movement and collision use only the street graph.** Both the ghost and Pac-Man are stored as *(edge, distance along edge)*, so they cannot be anywhere except on a street. The base map is purely visual.

**Graph pipeline.** Motorways, sidewalks, crossings, indoor corridors and tunnels are excluded. Ways are split at shared nodes, only the largest connected component is kept, dead-end stubs under 40 m are pruned, and pass-through nodes are merged. Every landmark and target is spliced into the graph as its own node at the closest point on a street, so "arrival" means reaching that node. The build fails if any place is more than 150 m from a street. Result: ~6.9k nodes, ~11.4k edges, ~500 KB.

To refresh the data: `npm run data:fetch && npm run data:build`. To edit places, change `data/places.json`, then run `npm run data:build`.

**Pac-Man** runs A* every `repathIntervalMs` (350 ms) toward where the ghost was `reactionDelayMs` (700 ms) ago. He waits `startGraceMs` at the start, then speeds up by `speedGainPerMinute` up to `maxSpeed`. The warning vignette, beeps and edge arrow use his real walking distance, not straight-line distance.

**Hints** are revealed one per landmark visit in this order: zone → bearing and distance from that landmark (in Manhattan terms: uptown, crosstown east, and so on) → neighborhood → hand-written fact → another bearing → street name → second fact. After that, each visit gives a new bearing.

**Score** = landmark points + 2/s survived + target bonus (1500 − 150 per hint, minimum 300, times 1.0/1.3/1.6 by difficulty).

**Balance check:** `npm run simulate` runs a bot that only flees. With the default config, it survives a median of about 3.5 min (range 50 s to 10 min) across 40 seeded runs.

## Status against the PRD

| Milestone | State |
|---|---|
| 1. Map and movement | Done. A soak test drives 10 minutes of random input on the real graph and asserts both movers stay on it and never get stuck. |
| 2. Chase loop | Done. Tuning still needs human playtests ("tense but escapable"). |
| 3. Objectives and hints | Done: 45 landmarks, 18 targets, fact cards, hint sequence. |
| 4. Scoring and polish | Done: end screen with animated route replay, local high scores, WebAudio sound effects, swipe controls and phone layout. Performance not yet measured on real hardware. |
| 5. Public beta | Not started. Analytics events fire, but `analytics.endpoint` in `config.json` is `null` until a tool is chosen. |

## Deviations and open questions

- **Base map: MapLibre + OpenFreeMap, not Google Maps.** The spec lists Google as primary, but its terms and pricing for this use are still an open question, and it needs an API key. The map layer is isolated in `src/ui/basemap.ts`, and the style URL is set in config, so switching later only touches that file. Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap / OpenMapTiles.
- **Pac-Man name and likeness** are Bandai Namco trademarks. The chaser is a generic yellow chomper drawn in code, but the name is used throughout. This must be decided before the beta.
- **Zoom** is a fixed range (15–17.5) set in config. Zoom that costs points is not implemented.
- Landmarks are **Manhattan only**.
