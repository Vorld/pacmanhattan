"""Real building colors.

Roofs: median color of the 2018 NYC aerial photo (NYC DoITT orthoimagery) inside each footprint.
Walls: NYC PLUTO lot data (year built + building class) mapped to period-appropriate materials,
       e.g. pre-war walk-up -> red/brown brick, pre-war elevator building -> limestone,
       post-war apartments -> white/buff brick, modern towers -> glass.
Adds "wc" (wall RGB ints) and "rc" (roof RGB ints) to data/map.js; the renderer falls back to the
old palette for any building without them.

Usage: python3 tools/color_buildings.py <map.js> <plutо buildings.csv.gz> [--borough-prefix 1]
Aerial tiles are cached in raw/ortho17/ (fetched politely, once).
"""

import csv
import gzip
import io
import json
import math
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image
from shapely import STRtree, points
from shapely.geometry import Polygon

LAT0, LON0 = 40.758, -73.9855
ROT = math.radians(29.0)
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110540
Z = 17
TILE_URL = "https://maps.nyc.gov/xyz/1.0.0/photo/2018/{z}/{x}/{y}.png8"
CACHE = Path(__file__).resolve().parents[1] / "raw" / "ortho17"


def unproj(xs, ys):
    """Inverse of build_graph.proj: screen (x, -yr) -> (lat, lon)."""
    xr, yr = xs, -ys
    x = xr * math.cos(ROT) + yr * math.sin(ROT)
    y = -xr * math.sin(ROT) + yr * math.cos(ROT)
    return y / KY + LAT0, x / KX + LON0


def tile_px(lat, lon):
    n = 2 ** Z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return int(fx), int(fy), int((fx % 1) * 256), int((fy % 1) * 256)


def fetch_tile(key):
    x, y = key
    path = CACHE / f"{x}_{y}.png"
    if not path.exists():
        req = urllib.request.Request(TILE_URL.format(z=Z, x=x, y=y), headers={"User-Agent": "pacmanhattan-divhacks"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    path.write_bytes(r.read())
                break
            except Exception:
                time.sleep(1 + attempt)
        else:
            return key, None
    try:
        return key, Image.open(path).convert("RGB")
    except Exception:
        return key, None


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


# Wall materials (RGB). Chosen per period/class; small per-building jitter keeps blocks varied.
BROWNSTONE = (122, 84, 66)
RED_BRICK = (160, 82, 62)
DARK_BRICK = (128, 70, 56)
BUFF_BRICK = (201, 172, 132)
WHITE_BRICK = (222, 214, 198)
LIMESTONE = (214, 202, 178)
GRANITE = (170, 166, 158)
CONCRETE = (180, 178, 172)
GLASS = (120, 150, 172)
DARK_GLASS = (78, 92, 104)
VINYL = (214, 206, 190)


def wall_color(cls, year, h, bid):
    k = ((bid * 2654435761) % 1000) / 1000
    c0 = (cls or "?")[0]
    y = year or 0
    if c0 in "M":  # churches, synagogues
        base = GRANITE
    elif c0 in "PQ":  # culture, civic
        base = LIMESTONE
    elif c0 in "EF":  # warehouses, factories
        base = RED_BRICK if y and y < 1960 else CONCRETE
    elif c0 == "G":  # garages
        base = CONCRETE
    elif c0 in "O":  # offices
        base = LIMESTONE if y and y < 1940 else DARK_GLASS if y < 1985 else GLASS
    elif c0 in "D" or (c0 == "R" and h > 40):  # elevator apartments / condos
        if y and y < 1940:
            base = LIMESTONE if k < 0.55 else BUFF_BRICK
        elif y < 1975:
            base = WHITE_BRICK if k < 0.6 else BUFF_BRICK
        elif y < 1995:
            base = BUFF_BRICK if k < 0.5 else DARK_BRICK
        else:
            base = GLASS if h > 60 else BUFF_BRICK
    elif c0 in "C":  # walk-ups
        base = BROWNSTONE if (y and y < 1910 and k < 0.35) else RED_BRICK if k < 0.75 else DARK_BRICK
    elif c0 in "AB":  # 1-2 family homes
        base = BROWNSTONE if y and y < 1920 and k < 0.5 else VINYL if y > 1950 and k < 0.6 else RED_BRICK
    elif c0 == "H":  # hotels
        base = LIMESTONE if y and y < 1950 else GLASS
    else:  # unknown: fall back on height
        base = GLASS if h > 90 else LIMESTONE if h > 32 else RED_BRICK
    return lerp(base, (240, 232, 218), (k - 0.5) * 0.18) if k > 0.5 else lerp(base, (60, 50, 44), (0.5 - k) * 0.18)


def pack(c):
    return (c[0] << 16) | (c[1] << 8) | c[2]


def main():
    map_path = Path(sys.argv[1])
    pluto_path = Path(sys.argv[2])
    boro = sys.argv[sys.argv.index("--borough-prefix") + 1] if "--borough-prefix" in sys.argv else None
    CACHE.mkdir(parents=True, exist_ok=True)

    src = map_path.read_text()
    head, body = src.split("PM_DATA.map=", 1)
    D = json.loads(body.rstrip().rstrip(";"))
    q = D.get("q", 2)
    B = D["buildings"]
    print(f"{len(B)} buildings", file=sys.stderr)

    # footprints in lat/lon
    polys, samples = [], []
    for i, flat in enumerate(B):
        pts = [unproj(flat[2 * j] / q, flat[2 * j + 1] / q) for j in range(len(flat) // 2)]
        poly = Polygon([(lon, lat) for lat, lon in pts]).buffer(0)
        polys.append(poly)
        minx, miny, maxx, maxy = poly.bounds
        s = [(poly.representative_point().y, poly.representative_point().x)]
        for a in (0.25, 0.5, 0.75):
            for b in (0.25, 0.5, 0.75):
                lon, lat = minx + (maxx - minx) * a, miny + (maxy - miny) * b
                if poly.contains(points(lon, lat)):
                    s.append((lat, lon))
        samples.append(s)

    # ---- roofs from aerial tiles ----
    tiles = {}
    for s in samples:
        for lat, lon in s:
            tx, ty, _, _ = tile_px(lat, lon)
            tiles[(tx, ty)] = None
    print(f"{len(tiles)} aerial tiles (zoom {Z})", file=sys.stderr)
    with ThreadPoolExecutor(6) as ex:
        for n, (key, img) in enumerate(ex.map(fetch_tile, tiles)):
            tiles[key] = img
            if n % 250 == 0:
                print(f"  tiles {n}/{len(tiles)}", file=sys.stderr)
    rc, missing_roof = [], 0
    for s in samples:
        px = []
        for lat, lon in s:
            tx, ty, x, y = tile_px(lat, lon)
            img = tiles.get((tx, ty))
            if img:
                px.append(img.getpixel((x, y)))
        if px:
            px.sort(key=lambda c: sum(c))
            med = px[len(px) // 2]
            # aerials read dark and flat under a lit 3D scene: lift a little, keep the hue
            rc.append(pack(lerp(med, (235, 230, 220), 0.12)))
        else:
            rc.append(None)
            missing_roof += 1

    # ---- walls from PLUTO (year built + building class) ----
    lots = []
    with gzip.open(pluto_path, "rt") as f:
        for r in csv.DictReader(f):
            if boro and not r["bbl"].startswith(boro):
                continue
            try:
                lots.append((float(r["lon"]), float(r["lat"]), r["bldgclass"], int(float(r["year_built"] or 0))))
            except ValueError:
                continue
    tree = STRtree(polys)
    info = [None] * len(polys)
    lot_pts = points([(x, y) for x, y, _, _ in lots])
    hit_lot, hit_poly = tree.query(lot_pts, predicate="within")
    for li, pi in zip(hit_lot, hit_poly):
        if info[pi] is None:
            info[pi] = lots[li][2:]
    # lots whose centroid misses every footprint: give their class to the nearest footprint within ~25 m
    unmatched = [i for i, v in enumerate(info) if v is None]
    if unmatched:
        near = tree.query_nearest(lot_pts, max_distance=0.00025, return_distance=False)
        for li, pi in zip(*near):
            if info[pi] is None:
                info[pi] = lots[li][2:]
    matched = sum(v is not None for v in info)
    wc = [pack(wall_color(v[0] if v else None, v[1] if v else 0, D["bh"][i], i)) for i, v in enumerate(info)]

    D["wc"] = wc
    D["rc"] = [c if c is not None else w for c, w in zip(rc, wc)]
    map_path.write_text(head + "PM_DATA.map=" + json.dumps(D, separators=(",", ":")) + ";\n")
    print(f"roofs from aerials: {len(B) - missing_roof}/{len(B)}; walls from PLUTO: {matched}/{len(B)}", file=sys.stderr)


if __name__ == "__main__":
    main()
