# PACMANhattan — Product Requirements Document

## Overview

PACMANhattan is a location-based mobile web game where you play as a **ghost** being chased by Pac-Man through the real streets of Manhattan. To survive, you complete real-world exploration challenges — find a mural, a food cart, a community garden — while Pac-Man closes in.

Pac-Man is the pressure. The challenges are the fun. **Manhattan is the maze.**

**Hackathon:** DivHacks 2026 (Columbia University, Sep 26-27)
**Platform:** Mobile web, portrait (no app install)

---

## Core Loop

1. **Get a challenge** — an open-ended prompt ("Find a street performer")
2. **Move** — Pac-Man is walking toward you along real streets
3. **Find it** — tap "FOUND IT!", snap a photo
4. **Get a reward** — Pac-Man is pushed back
5. Repeat until you're caught or you quit

Everything should feel super fun and easy: one big button at a time, no menus, no settings.

---

## Aesthetic

A 1980 arcade cabinet, played on the streets of Manhattan.

- **Palette:** pure black background, neon maze blue, Pac-Man yellow, and the four ghost colors (red, pink, cyan, orange)
- **Type:** Press Start 2P (pixel font) for headings, numbers, and callouts; a clean sans for challenge body text so it's easy to read while walking
- **Buttons:** chunky, high-contrast, thumb-sized
- **Motion:** snappy arcade animations — text that flashes, things that warp and chomp

### The map: Manhattan as a Pac-Man board

- **Rotated so the grid is vertical.** Manhattan's grid runs ~29° off true north; we set the map bearing to 29° so avenues run straight up the screen and the island fills a portrait phone like an arcade maze.
- **Locked to Manhattan.** The map can't pan or zoom off the island.
- **Maze styling:** black land and water, streets drawn as glowing neon-blue corridors, small faint gray street labels so players can still navigate. No buildings, no clutter.
- **Dots:** streets near you are sprinkled with dots. Pac-Man eats them as he moves — that's his trail.
- **Ghost trail:** a faint glowing line in your ghost's color showing everywhere you've been.

---

## 1. Start

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│                  │   │  ║ ║ ║ ║ ║ ║ ║  │   │ ● 640m ⏱0:00 ★0  │
│   PACMANhattan   │   │  ║═╬═╬═╬═╬═╬═║  │   │ ║ · · ║ · · ║    │
│                  │   │  ║ ║ ║ ║ ║ ║ ║  │   │ ╬═════╬═════╬    │
│      ᗣ ᗣ ᗣ ᗣ     │ → │  ║═╬═ᗧ═╬═╬═╬═║  │ → │ ║     ║  ᗣ  ║    │
│   pick a ghost   │   │  ║ ║ ║ ║ ║ ║ ║  │   │ ╬═════╬═════╬    │
│                  │   │  ║═╬═╬═╬═ᗣ═╬═║  │   │┌────────────────┐│
│  [ TAP TO PLAY ] │   │     READY!       │   ││ 🎨 STREET ART  ││
└──────────────────┘   └──────────────────┘   └────────────────┘─┘
  landing                 fly-in over island     zoom to you, go
```

1. **Landing** — pixel logo, the four ghosts bobbing. Tap one to pick your ghost (Blinky, Pinky, Inky, Clyde) — it sets your color for your icon, trail, and share card. Then **TAP TO PLAY**.
2. **Location** — a friendly pre-screen ("Pac-Man needs to know where you are 👀"), then the browser prompt.
3. **Not in Manhattan?** A "Head to Manhattan to play" screen with the island drawn as a maze.
4. **Fly-in** — the camera starts on the whole island, Pac-Man spawns **~800m away**, then the camera swoops down to you.
5. **"READY!"** flashes in yellow, arcade-style.
6. Pac-Man starts moving and the **first challenge card** slides up.

## 2. The Game Screen

```
┌──────────────────────┐
│ ● 420m  ⏱ 12:04  ★ 3 │  ← HUD
│                      │
│  ║ · · · ║     ║     │
│  ╬═══════╬═════╬     │
│  ║       ║     ║     │
│  ║    ᗧ· · ·   ║     │  ← Pac-Man eating dots
│  ╬═══════╬═════╬     │
│  ║       ║  ᗣ  ║     │  ← you
│┌────────────────────┐│
││ 🎨  STREET ART     ││
││ Find a mural or    ││
││ piece of street art││
││                    ││
││  [  FOUND IT!  ]   ││
│└────────────────────┘│
│               ✕ done │
└──────────────────────┘
```

**HUD (top):**
- **Distance pill** — Pac-Man's distance, color-coded: green 400m+, yellow 200–400m, red <200m
- **Timer** — time survived
- **★ count** — challenges completed

**Map (middle):** always follows you, grid stays vertical. Shows you, Pac-Man, dots, and your trail.

**Challenge card (bottom):**
- Category icon + name in pixel font, prompt in large readable text
- One huge **FOUND IT!** button
- Swipe down to shrink it to a thin bar and see more map; tap to expand
- No skipping — you work on a challenge until you complete it

**Categories** (each with its own icon and color, like arcade bonus fruit):
🍒 Food · 🎨 Art · 🌳 Nature · 📚 Culture · 🏛 History

**Done:** small ✕ in the corner, hold to confirm (so a stray tap doesn't end your run).

**Proximity alert:** under 200m the screen border pulses yellow; under 100m it pulses red and faster.

**Pac-Man:**
- Walks real streets toward you at a fixed **~4 km/h**
- Re-routes to your position every ~10 seconds
- Never stops (except during Freeze)

## 3. Challenges

Open-ended prompts with no single answer and no pin on the map — you decide where to go. They should be doable from almost anywhere in Manhattan and get you looking at the city, not your phone.

**Examples (all categories mixed together):**
- Find a restaurant serving a cuisine you've never tried
- Find a mural or piece of street art
- Find a community garden
- Find a shop with signs in a language you can't read
- Find a food cart or street vendor
- Find a building with an interesting fire escape
- Find a bookstore or record shop
- Find a street named after a person
- Find a street performer or busker
- Find a waterfront you can touch

## 4. Submitting a Challenge

1. Tap **FOUND IT!** — the camera opens immediately. No screens in between.
2. Take the photo.
3. The photo pops up as a **polaroid** — every submission counts.
4. The reward hits the screen (e.g. **⚡ TELEPORT!**) and plays out on the map — Pac-Man visibly warps away.
5. The polaroid flies into a photo stack in the corner.
6. The next challenge card slides up.

**Rewards:**

| Reward | Effect | Chance |
|--------|--------|--------|
| **Teleport** | Pac-Man is sent 500–800m away | ~70% |
| **Freeze** | Pac-Man stops for 30 seconds (turns blue, like a frightened ghost) | ~20% |
| **Power Pellet** | For 60 seconds, if Pac-Man reaches you, *it* gets sent away instead | ~10% |

## 5. Caught

Pac-Man within **50m for 3+ seconds** = caught (the delay absorbs GPS jitter).

1. Pac-Man chomps you — your ghost turns into the classic floating **eyes**.
2. **GAME OVER** screen, arcade style:
   - Time survived, distance walked, challenges completed (pixel font)
   - Your photos as a polaroid strip
3. **SHARE** — a 9:16 card (Instagram-story sized): the rotated Manhattan maze with your ghost trail and Pac-Man's trail, your stats, and your photos, all in your ghost's color.
4. **PLAY AGAIN**

Holding **✕ done** ends the run and shows the same screen — no penalty.

---

## Technical Notes

| Layer | Choice |
|-------|--------|
| Framework | Next.js + TypeScript + Tailwind |
| Map | MapLibre GL with a custom maze style on OpenFreeMap vector tiles (free, no key); `bearing: 29`, `maxBounds` = Manhattan |
| Font | Press Start 2P (Google Fonts) |
| GPS | `navigator.geolocation.watchPosition` (high accuracy) |
| Pac-Man routing | OSRM **foot** profile (`routing.openstreetmap.de/routed-foot/`) — the main OSRM demo server is car-only |
| Challenges | Static JSON (prompt, category) |
| Photos | `<input type="file" capture="environment">`, downscaled to ~800px |
| Share card | Render to canvas → PNG; Web Share API on mobile, download fallback |

**Gotchas to handle:**
- **Pac-Man position is time-based** — compute it from route + start time + speed, so it stays correct if the phone locks or the tab is backgrounded.
- **Persist game state to sessionStorage** — iOS Safari can reload the page after the camera closes.
- **Keep Pac-Man in Manhattan** — spawn and teleport points stay on the island and snap to a street (OSRM `nearest`), never in the river.
- **If routing fails**, Pac-Man moves in a straight line.
- **HTTPS is required** for geolocation — test on a deployed URL.
- **Share card map** — MapLibre needs `preserveDrawingBuffer: true` to capture the map as an image.

---

## Scope

### Must Have
- [ ] Landing screen with ghost pick
- [ ] Rotated, Manhattan-locked maze map
- [ ] Live position + Pac-Man following streets
- [ ] Ghost trail and Pac-Man dot trail
- [ ] HUD: distance pill, timer, ★ count
- [ ] Challenge card + FOUND IT! → camera → polaroid flow
- [ ] Teleport reward
- [ ] Caught detection + game over screen
- [ ] Share card
- [ ] Hold-to-quit

### Should Have
- [ ] Freeze and Power Pellet rewards
- [ ] Fly-in + READY! intro
- [ ] Proximity border pulse
- [ ] Caught animation (ghost → eyes)
- [ ] Chiptune sound effects

### Later
- [ ] Verification — check where each photo was taken against OpenStreetMap to see if the place matches the challenge. Not shown to players; just data for us.

---

## Success

A judge opens the app on their phone, picks a ghost, watches Manhattan turn into a maze, sees Pac-Man coming for them, snaps a photo, watches Pac-Man warp away, and walks off with a share card of their chase.
