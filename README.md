> **The current game is in [`upload-1-code/pacman-3d/`](upload-1-code/pacman-3d/)**: 3D, five boroughs, real building colors, 1 or 2 players. Run it with `cd upload-1-code/pacman-3d && python3 -m http.server 8765`, then open http://localhost:8765. The rest of this README describes the first 2D prototype at the repo root.

# Pac-Manhattan (working title in-game: Manhattan Haunt)

A browser arcade game on a real map of Manhattan. You are a ghost running through real streets, chased by a hungry monster. Each run gives you one vague objective ("find the station where the ceiling shows the stars"). Visit famous landmarks for points and hints; reach the secret place before you get caught.

> **Status: early prototype (DivHacks 2026).** It runs end to end, but it needs a lot of polish. See [Known issues](#known-issues).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

No API keys needed. Map tiles come from CARTO (OpenStreetMap data).

## How to play

- **Move:** arrow keys or WASD. On phones: swipe or the on-screen d-pad.
- The ghost stays on streets and turns at intersections. Buildings, water and blocks are walls.
- **Landmarks (⭐):** first visit gives points, a fact card and one hint about the secret place.
- **Hints narrow it down** in order: part of Manhattan → direction and distance → neighborhood → a specific clue.
- **Don't get caught.** The chaser starts slower than you and speeds up. A red arrow, screen glow and beeping warn you when it's close.
- **Score** = landmark points + 1 point per second survived + a target bonus that shrinks with every hint used.

## How it works

| Part | File |
|---|---|
| Tuning (speeds, radii, zoom, scoring, title, chaser name) | `src/config.ts` |
| Street graph: loading, nearest node, A* pathfinding | `src/graph.ts` |
| Arcade movement along streets (ghost + chaser) | `src/mover.ts` |
| Map, game loop, chaser AI, landmarks, hints, HUD, minimap, audio, end screen | `src/main.ts` |
| Landmarks (48) and secret targets (14) with clues and facts | `public/data/places.json` |
| Walkable street graph (40,807 intersections, 43,646 segments, ~917 km) | `public/data/graph.json` |
| Graph builder (OpenStreetMap → graph.json) | `scripts/build_graph.py` |

- **Movement never leaves the graph**, so nothing can walk through a building. Only the largest connected part of the street network is kept, so nothing can get stuck on an island of streets.
- **The chaser** re-plans with A* every 400 ms toward where you were 550 ms ago (a reaction delay, so you can juke it) and speeds up over the run.
- **The map** is MapLibre with CARTO's dark basemap; the game draws on a canvas overlay and the camera follows the ghost.
- **Everything is client-side.** High scores live in `localStorage`. Run events (`run_start`, `landmark_visit`, `hint_shown`, `caught`, `target_found`) go to `window.__events` as a stub for real analytics.
- `window.__dbg()` returns live positions and the chaser's path, for automated playtests.

### Rebuilding the street graph

`scripts/build_graph.py` expects Overpass exports of Manhattan streets (`primary` through `pedestrian`) and Central Park paths, plus the NYC NTA 2020 boundaries (to clip to Manhattan). It was developed inside the DivHacks team repo, so the input paths point there. The built `public/data/graph.json` is committed, so you only need this to change the network.

## Known issues

- **Feel isn't tuned.** Speeds and the chase haven't had real human playtests. Everything to tweak is in `src/config.ts`.
- **Visuals are placeholder:** canvas-drawn sprites, basic HUD, no real art or animation polish.
- **Only a random-walking bot has tested it.** Start → chase → caught → end screen works. Landmark visits, hint reveals and winning by finding the target work in code but haven't been exercised in a scripted playtest yet.
- **Performance:** ~23 fps in a headless browser without a GPU; not yet measured on real laptops and phones (targets are 60 / 30 fps).
- **The graph is fine-grained** (sidewalk-level pedestrian segments and park paths), so the chaser's route sometimes reverses direction on very short segments.
- **Turning** picks the street closest to your arrow key within about 70°. Diagonal avenues (Broadway) can feel odd.
- **No sound design** beyond simple beeps.

## Naming and trademark

"Pac-Man" and its character are Bandai Namco trademarks. The in-game chaser is an original design ("the Chomper", a spiky blob) and the in-game title is set in `src/config.ts`. Decide on the final name and chaser before any public release.

## Credits

Map data © OpenStreetMap contributors (ODbL). Basemap © CARTO. Neighborhood boundaries: NYC Department of City Planning (NTA 2020).
