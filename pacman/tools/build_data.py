"""Turn OSM extracts into the game's data files (data/*.js).
# Before step 2, build/land.json, build/islands.json and build/opencoast.json come from raw/coast.json:
# see make_land() in build_graph.py. Run: python3 tools/build_graph.py --land

Run after tools/build_graph.py:  python3 tools/build_data.py
"""
import json, math, os, re, sys, glob
sys.path.insert(0, os.path.dirname(__file__))
from build_graph import proj, point_in_poly, assemble_rings, simplify
from city import C
import importlib
_places = importlib.import_module(C['places'])
LANDMARKS, TARGETS = _places.LANDMARKS, _places.TARGETS

RAW = C['raw']
OUT = C['out']
BUILD = C['build']
os.makedirs(OUT, exist_ok=True)

def ring_area(r):
    a = 0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2

def simplify_ring(pr, tol):
    """Douglas-Peucker for a closed ring (pr without repeated end point)."""
    if len(pr) < 4:
        return pr
    far = max(range(len(pr)), key=lambda i: (pr[i][0] - pr[0][0]) ** 2 + (pr[i][1] - pr[0][1]) ** 2)
    a = simplify(pr[:far + 1], tol)
    b = simplify(pr[far:] + [pr[0]], tol)
    return a[:-1] + b[:-1]

def flat(r, q=2):
    """Quantise a ring to 1/q metre ints, flattened [x0,y0,x1,y1,...]."""
    out = []
    for x, y in r:
        out += [round(x * q), round(y * q)]
    return out

def polys_from(elements, min_area=0, with_tags=False):
    rings = []
    for el in elements:
        t = el.get('tags', {})
        if el['type'] == 'way' and 'geometry' in el:
            g = [(p['lat'], p['lon']) for p in el['geometry']]
            if len(g) >= 4 and g[0] == g[-1]:
                rings.append((g, t, el['id']))
        elif el['type'] == 'relation':
            outers = [[(p['lat'], p['lon']) for p in m['geometry']] for m in el.get('members', [])
                      if m.get('role') == 'outer' and 'geometry' in m]
            for r in assemble_rings(outers):
                if len(r) >= 4 and r[0] == r[-1]:
                    rings.append((r, t, el['id']))
    out = []
    for r, t, i in rings:
        pr = [proj(*p) for p in r[:-1]]
        pr = simplify_ring(pr, 0.8)
        if len(pr) >= 3 and ring_area(pr) >= min_area:
            out.append((pr, t, i) if with_tags else pr)
    return out

def num(v):
    try:
        return float(re.match(r'\s*([0-9.]+)', str(v)).group(1))
    except Exception:
        return None

def building_height(t, area):
    h = num(t.get('height'))
    if h is None and num(t.get('building:levels')) is not None:
        h = num(t.get('building:levels')) * 3.4 + 2
    if h is None:
        h = 14 if area < 400 else 20
    return max(4, min(h, 540))

def building_color(t, h, bid):
    """Palette index: 0-4 brick/brownstone, 5-8 limestone, 9-12 glass towers, 13 civic/church, 14 industrial."""
    b = t.get('building', 'yes')
    k = (bid * 2654435761) % 1000
    if b in ('church', 'cathedral', 'chapel', 'synagogue', 'mosque', 'temple', 'civic', 'government', 'public', 'museum'):
        return 13
    if b in ('industrial', 'warehouse', 'garage', 'parking', 'train_station', 'transportation', 'shed', 'roof'):
        return 14
    if h > 90:
        return 9 + k % 4
    if h > 32:
        return 5 + k % 4
    return k % 5

def mainland_polys(open_chains):
    """Close open coastline chains along a big bounding box, choosing the side
    that does not contain Manhattan (Times Square = origin)."""
    allpts = [p for c in open_chains for p in c]
    X0 = min(p[0] for p in allpts) - 500; X1 = max(p[0] for p in allpts) + 500
    Y0 = min(p[1] for p in allpts) - 500; Y1 = max(p[1] for p in allpts) + 500
    W, H = X1 - X0, Y1 - Y0
    per = 2 * (W + H)
    def to_box(p):
        x, y = p
        d = {'t': y - Y0, 'r': X1 - x, 'b': Y1 - y, 'l': x - X0}
        side = min(d, key=d.get)
        if side == 't': return (x, Y0), (x - X0)
        if side == 'r': return (X1, y), W + (y - Y0)
        if side == 'b': return (x, Y1), W + H + (X1 - x)
        return (X0, y), 2 * W + H + (Y1 - y)
    corners = [(W, (X1, Y0)), (W + H, (X1, Y1)), (2 * W + H, (X0, Y1)), (per, (X0, Y0))]
    def walk(t0, t1, forward):
        pts = []
        if forward:
            t = t0
            span = (t1 - t0) % per
            for c, p in sorted(((c - t0) % per, p) for c, p in corners):
                if 0 < c < span: pts.append(p)
        else:
            span = (t0 - t1) % per
            for c, p in sorted(((t0 - c) % per, p) for c, p in corners):
                if 0 < c < span: pts.append(p)
        return pts
    out = []
    for ch in open_chains:
        (pe, te) = to_box(ch[-1]); (ps, ts) = to_box(ch[0])
        for fwd in (True, False):
            poly = list(ch) + [pe] + walk(te, ts, fwd) + [ps]
            if not point_in_poly(0, 0, poly):
                out.append(simplify_ring(poly, 2))
                break
    return out

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace('&', 'and'))

def main():
    # --- land ---
    islands = json.load(open(BUILD + 'islands.json'))
    islands = [simplify_ring([tuple(p) for p in r[:-1]], 1.0) for r in islands]
    opencoast = json.load(open(BUILD + 'opencoast.json'))
    mainland = mainland_polys([[tuple(p) for p in c] for c in opencoast]) if opencoast else []

    # --- parks / water / buildings ---
    green = polys_from(json.load(open(RAW + 'green.json'))['elements'], 60)
    water = polys_from(json.load(open(RAW + 'water.json'))['elements'], 60)
    bfiles = sorted(glob.glob(RAW + 'b[0-9].json')) or ([RAW + 'buildings.json'] if os.path.exists(RAW + 'buildings.json') else [])
    seen = set(); belems = []
    for f in bfiles:
        for el in json.load(open(f))['elements']:
            if el['id'] not in seen:
                seen.add(el['id']); belems.append(el)
    btag = polys_from(belems, 25, with_tags=True)
    buildings = [r for r, t, i in btag]
    bh = [round(building_height(t, ring_area(r))) for r, t, i in btag]
    bc = [building_color(t, h, i) for (r, t, i), h in zip(btag, bh)]
    print('green', len(green), 'water', len(water), 'buildings', len(buildings), file=sys.stderr)

    r1 = lambda r: [[round(x, 1), round(y, 1)] for x, y in r]
    mapdata = {
        'q': 2,
        'city': C['name'],
        'islands': [r1(r) for r in islands],
        'mainland': [r1(r) for r in mainland],
        'green': [flat(r) for r in green],
        'water': [flat(r) for r in water],
        'buildings': [flat(r) for r in buildings],
        'bh': bh,
        'bc': bc,
    }
    with open(OUT + 'map.js', 'w') as f:
        f.write('// Generated from OpenStreetMap data (c) OpenStreetMap contributors, ODbL.\n')
        f.write('window.PM_DATA=window.PM_DATA||{};PM_DATA.map=')
        json.dump(mapdata, f, separators=(',', ':'))
        f.write(';\n')

    graph = json.load(open(BUILD + 'graph.json'))
    with open(OUT + 'graph.js', 'w') as f:
        f.write('// Generated from OpenStreetMap data (c) OpenStreetMap contributors, ODbL.\n')
        f.write('window.PM_DATA=window.PM_DATA||{};PM_DATA.graph=')
        json.dump(graph, f, separators=(',', ':'))
        f.write(';\n')

    # --- places: refine coordinates using OSM features with matching names ---
    named = {}
    for el in (json.load(open(RAW + 'names.json'))['elements'] if os.path.exists(RAW + 'names.json') else []):
        c = el.get('center') or ({'lat': el['lat'], 'lon': el['lon']} if 'lat' in el else None)
        if c and 'name' in el.get('tags', {}):
            named.setdefault(norm(el['tags']['name']), []).append((c['lat'], c['lon']))
    def place(name, lat, lon):
        best = None; bd = 450
        for (la, lo) in named.get(norm(name), []):
            d = math.hypot((la - lat) * 110540, (lo - lon) * 84300)
            if d < bd: bd, best = d, (la, lo)
        if best: lat, lon = best
        x, y = proj(lat, lon)
        return round(x, 1), round(y, 1), best is not None, (round(lat, 6), round(lon, 6))
    wiki = json.load(open(BUILD + 'wiki.json')) if os.path.exists(BUILD + 'wiki.json') else {}
    import base64
    def wikirec(name):
        w = wiki.get(name) or {}
        r = {}
        if w.get('about'): r['about'] = w['about']
        if w.get('url'): r['wiki'] = w['url']
        if w.get('img') and os.path.exists(w['img']):
            r['img'] = 'data:image/jpeg;base64,' + base64.b64encode(open(w['img'], 'rb').read()).decode()
            r['credit'] = ' '.join(x for x in [w.get('credit', ''), w.get('license', '')] if x).strip() or 'Wikimedia Commons'
            r['file'] = w.get('file', '')
        return r
    lm, tg = [], []
    miss = []
    for name, lat, lon, fact in LANDMARKS:
        x, y, ok, ll = place(name, lat, lon)
        if not ok: miss.append(name)
        lm.append({'name': name, 'x': x, 'y': y, 'lat': ll[0], 'lon': ll[1], 'fact': fact, **wikirec(name)})
    for name, lat, lon, cat, fact in TARGETS:
        x, y, ok, ll = place(name, lat, lon)
        if not ok: miss.append(name)
        tg.append({'name': name, 'x': x, 'y': y, 'lat': ll[0], 'lon': ll[1], 'cat': cat, 'fact': fact, **wikirec(name)})
    print('places matched in OSM:', len(lm) + len(tg) - len(miss), '/', len(lm) + len(tg), file=sys.stderr)
    print('kept approximate coords for:', miss, file=sys.stderr)
    with open(OUT + 'places.js', 'w') as f:
        f.write('window.PM_DATA=window.PM_DATA||{};PM_DATA.places=')
        json.dump({'landmarks': lm, 'targets': tg}, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';\n')
    for fn in ('map.js', 'graph.js', 'places.js'):
        print(fn, round(os.path.getsize(OUT + fn) / 1e6, 2), 'MB', file=sys.stderr)

if __name__ == '__main__':
    main()
