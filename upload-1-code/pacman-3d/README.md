# Pac-Manhattan

You're the ghost. Hungry chompers hunt you through real New York streets while you race to find famous places.

- Pick a borough in the lobby: all of Manhattan, a neighborhood-sized map of Brooklyn, Queens, the Bronx, or Staten Island, **Manhattan + Brooklyn** on one map, where the Brooklyn, Manhattan and Williamsburg Bridges take you across the East River, or **all five boroughs** on one map. In the five-borough map the Queensboro Bridge goes to Queens, the Macombs Dam and Third Avenue Bridges go to the Bronx, and the Staten Island Ferry leaves from Whitehall. The ferry carries you five times faster than running, and chompers can't board it, so they wait at the terminal. Each map loads only when you pick it.
- Buildings have their real colors: roofs from NYC's 2018 aerial photos, walls from each lot's year built and building class.
- Point your cursor where you want to go (or use the arrow keys / WASD). You stay snapped to real streets and park paths. A glowing ring and a street-name label show exactly where you are, and a fading trail shows where you've been.
- Each task is a riddle about a real place (written by Gemini from the place's Wikipedia summary). Find it before the name shows (after 30 seconds, at a ★ landmark, or when you press R) for a 50% bonus. A narrator (recorded with ElevenLabs) cheers you on. The place glows gold under a beam of light once it's in view. Reach it to score, and a new task starts right away.
- Visit the ★ landmarks to earn points and a hint with the target's walking distance and direction. The game pauses on a card with a photo, a fun fact, and a Street View link. Every place you reach goes into your Passport on the right, where you can click to see it again. Landmark stamps are kept per borough between runs.
- A new chomper joins after each task, up to three: Chomps chases you, Sneaky cuts you off on the way to your target, and Snooze wanders until you get close. They all respawn far away when you finish a task.

- After you pick a map, choose 1 or 2 players. **2 players** is split screen on one keyboard: Player 1 steers with WASD (left half), Player 2 with the arrow keys (right half). After a 3-second countdown, both ghosts start from the same spot and race to the same target. Whoever reaches it first scores. The race then pauses and both halves show that place's photo, fun fact, and description. Each player presses one of their keys when they're done reading, and after another countdown both get the next target, picked to be about equally far from each of them. One chomper chases whoever is closer. ★ landmarks give that player a hint without pausing the game. Getting caught puts you out. The match ends as soon as the winner is certain: most targets wins, and a tie goes to whoever survived longer.

In Manhattan and the multi-borough maps the map is rotated about 29° to the street grid, so up is uptown and right is east. The other boroughs are north-up.

## Run it

No build step. The only dependency is Three.js r160, loaded from cdnjs. The maps load as JSON, so serve the folder over http rather than opening the file directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html          page shell and screens
src/graph.js        street graph, movement helpers, A* / Dijkstra
src/render.js       2D painter for ground textures (land, parks, water, streets)
src/world3d.js      Three.js scene: ground tiles, toon-shaded buildings, x-ray view, target glow, markers
src/characters3d.js toon ghost and chompers, location bubble, trail, hint arrow
src/sprites.js      2D overlay arrow for an off-screen chomper
src/audio.js        WebAudio sound effects (no asset files)
src/ui.js           lobby, HUD, Passport, toasts, minimap with fog of war, game over, local high scores
src/game.js         borough loading, game loop, input, chomper personalities, tasks, hints, scoring (tuning in CFG), two-player race
src/style.css       styles
data/boroughs.json  lobby cards (name, area, difficulty, preview)
data/<borough>/     map.json, graph.json, places.json for each borough
tools/              data pipeline and headless tests
```

## Tuning

All gameplay numbers live in the `CFG` object at the top of `src/game.js`. They include ghost speed, the chomper's speed curve, spawn distance, task distances, and scoring.

## Rebuilding the map data

The data files are generated from OpenStreetMap through the Overpass API. Borough definitions (bounding box, projection, difficulty, start point) are in `tools/boroughs.py`.

1. Download the extracts. For Manhattan, run the queries in `tools/queries/` into `raw/` (`cd raw && ../tools/queries/fetch.sh ../tools/queries/q_streets.txt streets.json`, and so on), then `python3 tools/build_graph.py --land`. For the other boroughs, run `python3 tools/fetch_borough.py brooklyn queens bronx staten`.
2. Optionally, fetch photos and summaries from Wikipedia: `python3 tools/fetch_wiki.py` for Manhattan and `python3 tools/fetch_wiki.py brooklyn` (and so on) for the others, then `python3 tools/fetch_hd.py manhattan brooklyn queens bronx staten` for HD versions (up to 1280 px). Page titles are in `tools/wiki_titles.py`. Photos are written to `data/<borough>/img/` and load only when a card opens.
3. Build each borough: `python3 tools/build_borough.py manhattan brooklyn queens bronx staten`. This computes land from the coastline, builds the street graph, adds building heights and colors, and embeds the photos.
4. Add real building colors: `python3 tools/color_buildings.py all <lots.csv.gz>`. Roofs get the median color of NYC's 2018 aerial photos inside each footprint (tiles cached in `raw/ortho17/`). Walls come from NYC PLUTO year built and building class, mapped to period materials (brownstone, red brick, limestone, white brick, glass). The lot file needs `bbl, lat, lon, year_built, bldgclass` columns. Buildings without a lot match keep the pastel palette on their walls. Rerun this after step 3, since that step rewrites `map.json`, and before step 5.
5. Optionally, write riddle clues with Gemini: `GEMINI_API_KEY=... python3 tools/make_riddles.py`. Each place's riddle is written from its own fact and Wikipedia summary, and rejected if it uses a word of the name or a number that isn't in the source. Record the narrator with ElevenLabs: `ELEVENLABS_API_KEY=... python3 tools/make_voice.py` (writes `data/voice/`). Neither key is ever shipped to the browser.
5b. Build the multi-borough maps: `python3 tools/build_bridges.py`. It moves the other boroughs into Manhattan's projection and joins the street graphs with real crossings (landing points are in the script). It writes `data/bridges/` (Manhattan + Brooklyn, starting at City Hall) and `data/nyc/` (all five boroughs, starting at Times Square). The Staten Island Ferry is edge class 4: `CFG.ferrySpeed` sets how fast you ride it, and chompers never path across it.
6. Build the lobby cards: `python3 tools/build_lobby.py`. This includes both multi-borough cards.
7. Optionally, build the single-file page for claude.ai with `python3 tools/make_artifact.py`. It writes `dist/pac-manhattan.html`, which loads `data/` from next to it.

Places are hand-curated in `tools/places.py` (Manhattan) and `tools/places_boroughs.py` (the others). The build step moves each one to the matching OpenStreetMap feature when one exists by name. The build needs Python with `shapely`, `Pillow`, and `matplotlib`.

## Tests

With a local server running on port 8765, these scripts need Python Playwright:

```sh
python3 tools/smoke_v3.py brooklyn # lobby, run, Passport, chompers joining after each task
python3 tools/load_all.py         # every borough loads and a task can be completed
python3 tools/cursor_test.py      # ghost closes in on the cursor
```

## Not built yet

These PRD features come later: the global leaderboard with server-side score checks, ghost skins (the Passport stamps could unlock them), and more places (Manhattan has 95 targets of the planned 150; the other boroughs have 11 to 20 each).

## Credits and license

Map data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). The generated files in `data/` are derived from it and must keep this attribution.

Building colors come from NYC DoITT 2018 aerial imagery and NYC PLUTO lot data.

Place photos come from Wikimedia Commons. Each card shows the author and license, with a link to the source file. Summaries are from Wikipedia under CC BY-SA.

The chomper is an original character and is not affiliated with Pac-Man or Bandai Namco.
