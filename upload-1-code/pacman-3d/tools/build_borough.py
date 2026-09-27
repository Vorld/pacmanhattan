"""Build the game data for one borough map.

  python3 tools/build_borough.py brooklyn      # after tools/fetch_borough.py brooklyn
  python3 tools/build_borough.py manhattan     # uses the Manhattan extracts in raw/

Writes data/<id>/map.json, graph.json, places.json.  Run tools/build_lobby.py afterwards.
"""
import json, math, os, re, sys, glob, base64, subprocess
from collections import defaultdict
sys.path.insert(0, os.path.dirname(__file__))
import build_graph as BG
from boroughs import BOROUGHS
from shapely.geometry import LineString, Polygon, MultiPolygon, box, Point
from shapely.ops import split, unary_union, polygonize
from shapely.prepared import prep

def set_projection(b):
    BG.LAT0, BG.LON0 = b['origin']
    BG.ROT = math.radians(b['rot'])
    BG.KX = 111320 * math.cos(math.radians(BG.LAT0))

def ring_area(r):
    a = 0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2

def simplify_ring(pr, tol):
    if len(pr) < 4:
        return pr
    far = max(range(len(pr)), key=lambda i: (pr[i][0] - pr[0][0]) ** 2 + (pr[i][1] - pr[0][1]) ** 2)
    a = BG.simplify(pr[:far + 1], tol)
    b = BG.simplify(pr[far:] + [pr[0]], tol)
    return a[:-1] + b[:-1]

def flat(r, q=2):
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
            for r in BG.assemble_rings(outers):
                if len(r) >= 4 and r[0] == r[-1]:
                    rings.append((r, t, el['id']))
    out = []
    for r, t, i in rings:
        pr = [BG.proj(*p) for p in r[:-1]]
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
        h = 10 if area < 150 else 14 if area < 400 else 18
    return max(4, min(h, 540))

def building_color(t, h, bid):
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

# ---------------- land from coastline ----------------
def land_polygons(coast_elements, big):
    """Split the big box by coastline ways; keep the pieces on the coastline's left (land) side."""
    lines = []
    for w in coast_elements:
        pts = [BG.proj(g['lat'], g['lon']) for g in w['geometry']]
        if len(pts) >= 2:
            lines.append(LineString(pts))
    if not lines:
        return [big]
    merged = unary_union(lines + [big.exterior])
    pieces = [p for p in polygonize(merged) if p.within(big.buffer(1))]
    segs = []
    for ln in lines:
        c = list(ln.coords)
        for a, b in zip(c, c[1:]):
            segs.append((a, b))
    land = []
    for p in pieces:
        rp = p.representative_point()
        best, bd = None, 1e18
        for a, b in segs:
            ls = LineString([a, b])
            d = ls.distance(rp)
            if d < bd:
                bd, best = d, (a, b)
        (ax, ay), (bx, by) = best
        # land lies to the left of the coastline direction in (lon, lat) axes; our y axis is flipped
        cross = (bx - ax) * (rp.y - ay) - (by - ay) * (rp.x - ax)
        if cross < 0:
            land.append(p)
    return land

def rings_of(geom):
    if geom.is_empty:
        return []
    polys = [geom] if isinstance(geom, Polygon) else [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]
    return [list(p.exterior.coords)[:-1] for p in polys if p.area > 2000]

# ---------------- street graph ----------------
def build_graph(streets, paths, play):
    P = prep(play)
    coords = {}; adj = defaultdict(set); names = {}
    for w in streets + paths:
        t = w.get('tags', {})
        if t.get('access') in ('private', 'no'):
            continue
        ids = w['nodes']; geom = w['geometry']
        for nid, g in zip(ids, geom):
            if nid not in coords and g:
                coords[nid] = BG.proj(g['lat'], g['lon'])
        hw = t.get('highway', '')
        cls = 3 if hw.startswith(('primary', 'secondary')) else 2 if hw in ('tertiary', 'residential', 'unclassified', 'living_street', 'tertiary_link') else 1 if hw == 'pedestrian' else 0
        for a, b in zip(ids, ids[1:]):
            if a != b and a in coords and b in coords:
                adj[a].add(b); adj[b].add(a)
                names[(min(a, b), max(a, b))] = (t.get('name', ''), cls)
    keep = {n for n in adj if P.contains(Point(coords[n]))}
    for n in list(adj):
        if n not in keep:
            for m in adj[n]:
                adj[m].discard(n)
            del adj[n]
        else:
            adj[n] &= keep
    street_nodes = set(n for w in streets for n in w['nodes'] if n in adj)
    path_nodes = set(n for w in paths for n in w['nodes'] if n in adj)
    grid = defaultdict(list)
    for n in street_nodes:
        x, y = coords[n]; grid[(int(x // 40), int(y // 40))].append(n)
    for n in path_nodes - street_nodes:
        if len(adj[n]) > 1:
            continue
        x, y = coords[n]; best = None; bd = 30.0
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid[(int(x // 40) + dx, int(y // 40) + dy)]:
                    d = math.dist(coords[m], (x, y))
                    if d < bd:
                        bd, best = d, m
        if best is not None:
            adj[n].add(best); adj[best].add(n)
    stack = [n for n in adj if len(adj[n]) <= 1]
    while stack:
        n = stack.pop()
        if n not in adj or len(adj[n]) > 1:
            continue
        for m in adj[n]:
            adj[m].discard(n)
            if len(adj[m]) <= 1:
                stack.append(m)
        del adj[n]
    seen = set(); best = set()
    for s in adj:
        if s in seen:
            continue
        comp = {s}; q = [s]
        while q:
            u = q.pop()
            for v in adj[u]:
                if v not in comp:
                    comp.add(v); q.append(v)
        seen |= comp
        if len(comp) > len(best):
            best = comp
    adj = {n: adj[n] & best for n in best}
    junction = {n for n in adj if len(adj[n]) != 2}
    idx = {}; nodes_out = []
    for n in junction:
        idx[n] = len(nodes_out); x, y = coords[n]; nodes_out.append([round(x, 1), round(y, 1)])
    edges_out = []; done = set()
    for a in junction:
        for b in adj[a]:
            if (a, b) in done:
                continue
            chain = [a, b]; prev, cur = a, b
            while cur not in junction:
                nxt = next(iter(adj[cur] - {prev}))
                prev, cur = cur, nxt; chain.append(cur)
            for u, v in zip(chain, chain[1:]):
                done.add((u, v)); done.add((v, u))
            pts = BG.simplify([coords[c] for c in chain], 1.5)
            if sum(math.dist(p, q) for p, q in zip(pts, pts[1:])) < 0.5:
                continue
            nm, cls = names.get((min(chain[0], chain[1]), max(chain[0], chain[1])), ('', 0))
            edges_out.append({'a': idx[chain[0]], 'b': idx[chain[-1]], 'p': [[round(x, 1), round(y, 1)] for x, y in pts[1:-1]], 'n': nm, 'c': cls})
    return {'nodes': nodes_out, 'edges': edges_out}

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace('&', 'and'))

def fetch_names(bid, names, rel):
    out = f'raw/{bid}/names.json'
    if os.path.exists(out):
        return json.load(open(out))['elements']
    alts = '|'.join(re.escape(n).replace("'", ".") for n in names)
    q = f'[out:json][timeout:300];\narea({3600000000 + rel})->.m;\nnwr["name"~"^({alts})$",i](area.m);\nout center tags qt;\n'
    qf = f'raw/{bid}/q_names.txt'; open(qf, 'w').write(q)
    subprocess.run(['bash', 'raw/fetch.sh', qf, out])
    return json.load(open(out))['elements'] if os.path.exists(out) else []

def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
    print(path, round(os.path.getsize(path) / 1e6, 2), 'MB', file=sys.stderr)

def main(bid):
    b = BOROUGHS[bid]
    set_projection(b)
    if bid == 'manhattan':
        from places import LANDMARKS, TARGETS
        raw = 'raw/'
        streets = json.load(open(raw + 'streets.json'))['elements']
        paths = json.load(open(raw + 'parkpaths.json'))['elements']
        green_el = json.load(open(raw + 'green.json'))['elements']
        water_el = json.load(open(raw + 'water.json'))['elements']
        belems = {}
        for f in sorted(glob.glob(raw + 'b[0-9].json')):
            for el in json.load(open(f))['elements']:
                belems[el['id']] = el
        named_el = json.load(open(raw + 'names.json'))['elements']
        # Manhattan keeps its original land model (island rings + closed mainland chains)
        import build_data as BD
        islands = [simplify_ring([tuple(p) for p in r[:-1]], 1.0) for r in json.load(open('build/islands.json'))]
        mainland = BD.mainland_polys([[tuple(p) for p in c] for c in json.load(open('build/opencoast.json'))])
        graph = json.load(open('build/graph.json'))
        lm_src = [(n, la, lo, f) for n, la, lo, f in LANDMARKS]
        tg_src = [(n, la, lo, c, f) for n, la, lo, c, f in TARGETS]
        wiki_path = 'build/wiki.json'
    else:
        from places_boroughs import PLACES
        raw = f'raw/{bid}/'
        streets = json.load(open(raw + 'streets.json'))['elements']
        paths = json.load(open(raw + 'parkpaths.json'))['elements']
        green_el = json.load(open(raw + 'green.json'))['elements']
        water_el = json.load(open(raw + 'water.json'))['elements']
        belems = {el['id']: el for el in json.load(open(raw + 'buildings.json'))['elements']}
        s, w, n, e = b['bbox']
        corners = [BG.proj(s, w), BG.proj(s, e), BG.proj(n, e), BG.proj(n, w)]
        playbox = Polygon(corners)
        bigc = [BG.proj(s - 0.02, w - 0.025), BG.proj(s - 0.02, e + 0.025), BG.proj(n + 0.02, e + 0.025), BG.proj(n + 0.02, w - 0.025)]
        big = Polygon(bigc)
        land = unary_union(land_polygons(json.load(open(raw + 'coast.json'))['elements'], big))
        bnd = json.load(open(raw + 'boundary.json'))['elements'][0]
        outers = [[(p['lat'], p['lon']) for p in m['geometry']] for m in bnd['members'] if m.get('role') == 'outer' and 'geometry' in m]
        bpoly = unary_union([Polygon([BG.proj(*p) for p in r]).buffer(0) for r in BG.assemble_rings(outers) if len(r) > 3])
        play = land.intersection(playbox).intersection(bpoly.buffer(30))
        islands = rings_of(play.buffer(0))
        mainland = rings_of(land.difference(play).buffer(0))
        islands = [simplify_ring([(round(x, 1), round(y, 1)) for x, y in r], 1.0) for r in islands]
        mainland = [simplify_ring([(round(x, 1), round(y, 1)) for x, y in r], 2.0) for r in mainland]
        graph = build_graph(streets, paths, play.buffer(15))
        P = PLACES[bid]
        lm_src = P['landmarks']; tg_src = P['targets']
        named_el = fetch_names(bid, [x[0] for x in lm_src + tg_src], b['rel'])
        wiki_path = f'build/{bid}/wiki.json'
        # keep only buildings inside the play area
        PP = prep(play.buffer(40))
    print(bid, 'graph', len(graph['nodes']), 'nodes', len(graph['edges']), 'edges', file=sys.stderr)

    green = polys_from(green_el, 60)
    water = polys_from(water_el, 60)
    btag = polys_from(list(belems.values()), 20, with_tags=True)
    if bid != 'manhattan':
        btag = [x for x in btag if PP.contains(Point(x[0][0]))]
    buildings = [r for r, t, i in btag]
    bh = [round(building_height(t, ring_area(r))) for r, t, i in btag]
    bc = [building_color(t, h, i) for (r, t, i), h in zip(btag, bh)]
    print(bid, 'green', len(green), 'water', len(water), 'buildings', len(buildings), file=sys.stderr)

    r1 = lambda r: [[round(x, 1), round(y, 1)] for x, y in r]
    xs = [p[0] for p in graph['nodes']]; ys = [p[1] for p in graph['nodes']]
    meta = {k: b[k] for k in ('name', 'area', 'difficulty', 'speed', 'start', 'task_min', 'task_max', 'first_max', 'grid_words', 'rot')}
    meta['id'] = bid
    meta['bounds'] = [min(xs), min(ys), max(xs), max(ys)]
    write_json(f'data/{bid}/map.json', {
        'meta': meta, 'q': 2,
        'islands': [r1(r) for r in islands], 'mainland': [r1(r) for r in mainland],
        'green': [flat(r) for r in green], 'water': [flat(r) for r in water],
        'buildings': [flat(r) for r in buildings], 'bh': bh, 'bc': bc,
    })
    write_json(f'data/{bid}/graph.json', graph)

    # places
    named = {}
    for el in named_el:
        c = el.get('center') or ({'lat': el['lat'], 'lon': el['lon']} if 'lat' in el else None)
        if c and 'name' in el.get('tags', {}):
            named.setdefault(norm(el['tags']['name']), []).append((c['lat'], c['lon']))
    wiki = json.load(open(wiki_path)) if os.path.exists(wiki_path) else {}
    import shutil
    imgdir = f'data/{bid}/img'
    if os.path.isdir(imgdir):
        shutil.rmtree(imgdir)
    os.makedirs(imgdir, exist_ok=True)
    def wikirec(name):
        wr = wiki.get(name) or {}
        r = {}
        if wr.get('about'): r['about'] = wr['about']
        if wr.get('url'): r['wiki'] = wr['url']
        src = wr.get('hd') if wr.get('hd') and os.path.exists(wr['hd']) else wr.get('img')
        if src and os.path.exists(src):
            dst = f'{imgdir}/{os.path.basename(src)}'
            shutil.copyfile(src, dst)
            r['img'] = dst  # served next to the page; loaded only when a card opens
            r['credit'] = ' '.join(x for x in [wr.get('credit', ''), wr.get('license', '')] if x).strip() or 'Wikimedia Commons'
            r['file'] = wr.get('file', '')
        return r
    miss = []
    def place(name, lat, lon):
        best = None; bd = 450
        for (la, lo) in named.get(norm(name), []):
            d = math.hypot((la - lat) * 110540, (lo - lon) * 84300)
            if d < bd: bd, best = d, (la, lo)
        if best: lat, lon = best
        else: miss.append(name)
        x, y = BG.proj(lat, lon)
        return round(x, 1), round(y, 1), round(lat, 6), round(lon, 6)
    lm, tg = [], []
    for name, lat, lon, fact in lm_src:
        x, y, la, lo = place(name, lat, lon)
        lm.append({'name': name, 'x': x, 'y': y, 'lat': la, 'lon': lo, 'fact': fact, **wikirec(name)})
    for name, lat, lon, cat, fact in tg_src:
        x, y, la, lo = place(name, lat, lon)
        tg.append({'name': name, 'x': x, 'y': y, 'lat': la, 'lon': lo, 'cat': cat, 'fact': fact, **wikirec(name)})
    print(bid, 'places matched in OSM:', len(lm) + len(tg) - len(miss), '/', len(lm) + len(tg), 'approx:', miss, file=sys.stderr)
    write_json(f'data/{bid}/places.json', {'landmarks': lm, 'targets': tg})

if __name__ == '__main__':
    for bid in sys.argv[1:]:
        main(bid)
