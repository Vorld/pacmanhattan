# Pac-Manhattan

You're the ghost. A hungry yellow chomper hunts you through real Manhattan streets while you race to find famous places.

- Point your cursor where you want to go (or use the arrow keys / WASD). You stay snapped to real streets and park paths.
- Each task names a real place, such as "Find Katz's Delicatessen." It glows gold under a beam of light once it's in view. Reach it to score, and a new task starts right away.
- Visit the ★ landmarks to earn points and a hint that gives the target's walking distance and direction. The game pauses on a card with a photo, a fun fact, and a Street View link.
- The chomper gets faster with every task you finish. If it catches you, the run is over.

The map is rotated about 29° to the Manhattan grid, so up is uptown and right is east.

## Run it

No build step. The only dependency is Three.js r160, loaded from cdnjs. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html          page shell and screens
src/graph.js        street graph, movement helpers, A* / Dijkstra
src/render.js       2D painter for ground textures (land, parks, water, streets)
src/world3d.js      Three.js scene: ground tiles, extruded buildings, x-ray view, target glow, markers
src/characters3d.js 3D ghost, chomper and hint arrow
src/sprites.js      2D overlay arrow for an off-screen chomper
src/audio.js        WebAudio sound effects (no asset files)
src/ui.js           HUD, toasts, minimap with fog of war, game over, local high scores
src/game.js         game loop, input, chomper AI, tasks, hints, scoring (tuning in CFG)
src/style.css       styles
data/*.js           generated map, street graph, and places
tools/              data pipeline and headless tests
```

## Tuning

All gameplay numbers live in the `CFG` object at the top of `src/game.js`. They include ghost speed, the chomper's speed curve, spawn distance, task distances, and scoring.

## Rebuilding the map data

The data files are generated from OpenStreetMap through the Overpass API.

1. Download the raw extracts into `raw/` (queries in `tools/queries/`, run `cd raw && ../tools/queries/fetch.sh ../tools/queries/q_streets.txt streets.json`, and so on; the building queries write `b1.json` to `b4.json`).
2. Build the land shapes and street graph with `python3 tools/build_graph.py --land`.
3. Optionally, fetch photos and summaries from Wikipedia with `python3 tools/fetch_wiki.py`. Page titles are in `tools/wiki_titles.py`.
4. Write `data/*.js` with `python3 tools/build_data.py`. This adds building heights and colors, and embeds the photos.
5. Optionally, build the single-file bundle with `python3 tools/make_artifact.py`. It writes `dist/pac-manhattan.html`.

Targets and landmarks are hand-curated in `tools/places.py`. The build step moves each one to the matching OpenStreetMap feature when one exists by name.

## Tests

With a local server running on port 8765, these scripts need Python Playwright:

```sh
python3 tools/smoke.py   # loads, moves, measures fps
python3 tools/flow.py    # landmark hint, task completion, game over, high score save
python3 tools/bot.py     # 90 s of random input: no errors, no stuck ghost
python3 tools/smoke3d.py # 3D build, landmark card, target glow (software WebGL)
python3 tools/cursor_test.py # ghost closes in on the cursor
```

## Not built yet

These PRD features come later: the global leaderboard with server-side score checks, ghost skins, and more targets (the list has 95 of the planned 150).

## Credits and license

Map data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). The generated files in `data/` are derived from it and must keep this attribution.

Place photos come from Wikimedia Commons. Each card shows the author and license, with a link to the source file. Summaries are from Wikipedia under CC BY-SA.

The chomper is an original character and is not affiliated with Pac-Man or Bandai Namco.
