"""Build the walkable street graph for Pac-Manhattan from OSM extracts.

Output coordinates are in "game meters": a local projection centred on Midtown,
rotated so Manhattan's avenues run straight up the screen ("Manhattan north").
"""
import json, math, sys
from collections import defaultdict

import os
sys.path.insert(0, os.path.dirname(__file__))
from city import C, KEY
LAT0, LON0 = C['origin']               # Manhattan: Times Square
ROT = math.radians(C['rot_deg'])       # Manhattan: grid offset from true north (29 deg)
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110540

def proj(lat, lon):
    x = (lon - LON0) * KX
    y = (lat - LAT0) * KY              # north positive
    # rotate by +29deg (counter-clockwise) so grid-north becomes screen-up
    xr = x * math.cos(ROT) - y * math.sin(ROT)
    yr = x * math.sin(ROT) + y * math.cos(ROT)
    return xr, -yr                     # screen y grows downward

def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside

def assemble_rings(ways):
    """Join way geometries (lists of (lat,lon)) into closed rings."""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        ring = segs.pop()
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[-1]:
                    ring += s[::-1][1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[0]:
                    ring = s + ring[1:]; segs.pop(i); changed = True; break
                if s[0] == ring[0]:
                    ring = s[::-1] + ring[1:]; segs.pop(i); changed = True; break
        rings.append(ring)
    return rings

def main():
    raw = C['raw']
    streets = json.load(open(raw + 'streets.json'))['elements']
    paths = json.load(open(raw + 'parkpaths.json'))['elements']
    land = json.load(open(C['build'] + 'land.json'))  # list of rings in game meters

    def on_land(x, y):
        return any(point_in_poly(x, y, r) for r in land)

    coords = {}
    adj = defaultdict(set)
    names = {}
    for w in streets + paths:
        t = w.get('tags', {})
        if t.get('access') in ('private', 'no'):
            continue
        ids = w['nodes']; geom = w['geometry']
        for nid, g in zip(ids, geom):
            if nid not in coords:
                coords[nid] = proj(g['lat'], g['lon'])
        for a, b in zip(ids, ids[1:]):
            if a != b:
                adj[a].add(b); adj[b].add(a)
                hw = t.get('highway', '')
                cls = 3 if hw.startswith(('primary', 'secondary')) else 2 if hw in ('tertiary', 'residential', 'unclassified', 'living_street', 'tertiary_link') else 1 if hw == 'pedestrian' else 0
                names[(min(a, b), max(a, b))] = (t.get('name', ''), cls)

    # clip to land (drops bridge decks over the rivers)
    keep = {n for n in adj if on_land(*coords[n])}
    for n in list(adj):
        if n not in keep:
            for m in adj[n]:
                adj[m].discard(n)
            del adj[n]
        else:
            adj[n] &= keep

    # connect park paths to nearby street nodes (NYC park paths meet sidewalks, not streets)
    street_nodes = set()
    for w in streets:
        street_nodes.update(n for n in w['nodes'] if n in adj)
    path_nodes = set()
    for w in paths:
        path_nodes.update(n for n in w['nodes'] if n in adj)
    grid = defaultdict(list)
    for n in street_nodes:
        x, y = coords[n]; grid[(int(x // 40), int(y // 40))].append(n)
    for n in path_nodes - street_nodes:
        if len(adj[n]) > 1:
            continue
        x, y = coords[n]; best = None; bd = 30.0
        gx, gy = int(x // 40), int(y // 40)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid[(gx + dx, gy + dy)]:
                    d = math.dist(coords[m], (x, y))
                    if d < bd:
                        bd, best = d, m
        if best is not None:
            adj[n].add(best); adj[best].add(n)

    # prune dead ends iteratively (no traps, Pac-Man style)
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

    # largest connected component
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

    # collapse degree-2 chains into polyline edges between junctions
    junction = {n for n in adj if len(adj[n]) != 2}
    idx = {}
    nodes_out = []
    for n in junction:
        idx[n] = len(nodes_out)
        x, y = coords[n]; nodes_out.append([round(x, 1), round(y, 1)])
    edges_out = []
    done = set()
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
            pts = [coords[c] for c in chain]
            pts = simplify(pts, 1.5)
            length = sum(math.dist(p, q) for p, q in zip(pts, pts[1:]))
            if length < 0.5:
                continue
            nm, cls = names.get((min(chain[0], chain[1]), max(chain[0], chain[1])), ('', 0))
            edges_out.append({'a': idx[chain[0]], 'b': idx[chain[-1]],
                              'p': [[round(x, 1), round(y, 1)] for x, y in pts[1:-1]],
                              'n': nm, 'c': cls})
    # handle pure cycles with no junction (rare): ignored
    print('nodes', len(nodes_out), 'edges', len(edges_out), file=sys.stderr)
    json.dump({'nodes': nodes_out, 'edges': edges_out}, open(C['build'] + 'graph.json', 'w'), separators=(',', ':'))

def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-9
    dmax, imax = 0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / L
        if d > dmax:
            dmax, imax = d, i
    if dmax > tol:
        return simplify(pts[:imax + 1], tol)[:-1] + simplify(pts[imax:], tol)
    return [pts[0], pts[-1]]

def make_land_from_ntas():
    """Land = NYC NTA 2020 boundaries (clipped to the shoreline), merged per borough, cropped to the play bbox.
    The playable borough's land clips the street graph; every borough in view is drawn as land."""
    from shapely.geometry import shape, box
    from shapely.ops import unary_union
    # NYC Open Data "2020 Neighborhood Tabulation Areas" GeoJSON (dataset 9nt8-h7nd)
    nta = json.load(open(os.environ.get('PM_NTA_GEOJSON', 'raw/nta2020.geojson')))
    s, w, n, e = C['bbox']
    view = box(w - 0.03, s - 0.03, e + 0.03, n + 0.03)
    play = box(w, s, e, n)
    by_boro = {}
    for f in nta['features']:
        by_boro.setdefault(f['properties']['boroname'], []).append(shape(f['geometry']))
    def rings(geom):
        out = []
        for g in getattr(geom, 'geoms', [geom]):
            if g.is_empty or g.area < 1e-7:
                continue
            out.append([proj(lat, lon) for lon, lat in g.exterior.coords])
        return out
    land, islands = [], []
    for boro, geoms in by_boro.items():
        u = unary_union(geoms).buffer(0.00005)
        if boro == C['name']:
            land += rings(u.intersection(play))
        islands += rings(u.intersection(view))
    json.dump(land, open(C['build'] + 'land.json', 'w'))
    json.dump([[[round(x, 1), round(y, 1)] for x, y in r] for r in islands], open(C['build'] + 'islands.json', 'w'))
    json.dump([], open(C['build'] + 'opencoast.json', 'w'))
    print('land rings', len(land), 'view rings', len(islands), file=sys.stderr)

def make_land():
    os.makedirs(C['build'], exist_ok=True)
    if C['land_from_ntas']:
        return make_land_from_ntas()
    c = json.load(open(C['raw'] + 'coast.json'))['elements']
    rings = assemble_rings([[(g['lat'], g['lon']) for g in w['geometry']] for w in c])
    closed = [[proj(*p) for p in r] for r in rings if r[0] == r[-1]]
    open_ = [[proj(*p) for p in r] for r in rings if r[0] != r[-1]]
    json.dump([r for r in closed if point_in_poly(0, 0, r)], open(C['build'] + 'land.json', 'w'))
    json.dump([[[round(x, 1), round(y, 1)] for x, y in r] for r in closed], open(C['build'] + 'islands.json', 'w'))
    json.dump([[[round(x, 1), round(y, 1)] for x, y in r] for r in open_], open(C['build'] + 'opencoast.json', 'w'))

if __name__ == '__main__':
    if '--land' in sys.argv:
        make_land()
    main()
