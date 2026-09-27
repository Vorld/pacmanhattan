# Pac-Manhattan

You're the ghost. Hungry chompers hunt you through real New York streets in 3D while you race to find places and collect landmark stamps. Built at DivHacks 2026.

**The game is in [`upload-1-code/pacman-3d/`](upload-1-code/pacman-3d/).** Its [README](upload-1-code/pacman-3d/README.md) covers how to play, the code layout, and how to rebuild the map data.

```sh
cd upload-1-code/pacman-3d
python3 -m http.server 8765
# open http://localhost:8765
```

- Five boroughs: Manhattan (the whole island), Brooklyn, Queens, the Bronx and Staten Island.
- **All five boroughs** on one map: bridges to Brooklyn, Queens and the Bronx, and the Staten Island Ferry (chompers can't board). There's also a smaller Manhattan + Brooklyn map.
- Real building colors: roofs from NYC's 2018 aerial photos, walls from NYC PLUTO year built and building class.
- 1 player, or 2 players split screen on one keyboard.

Map data © OpenStreetMap contributors (ODbL). Aerial imagery © NYC DoITT. Lot data: NYC PLUTO.
