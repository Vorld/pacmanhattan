"""Manhattan + Brooklyn on one map, joined by the East River bridges.

Reads data/manhattan and data/brooklyn (run tools/build_borough.py and tools/color_buildings.py first),
moves Brooklyn into Manhattan's projection, drops anything of Brooklyn's that sits on Manhattan,
joins the street graphs with the Brooklyn, Manhattan and Williamsburg Bridges, and writes data/bridges/.
Then run tools/build_lobby.py to add its lobby card.
"""
import json
import math
import os
import sys

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

sys.path.insert(0, os.path.dirname(__file__))
from boroughs import BOROUGHS  # noqa: E402

KY = 110540

# [name, Manhattan landing, deck points over the river, Brooklyn landing] (lat, lon)
BRIDGES = [
    ('Brooklyn Bridge', (40.7122, -74.0036), [(40.7075, -73.9985), (40.7045, -73.9950)], (40.6997, -73.9904)),
    ('Manhattan Bridge', (40.7170, -73.9956), [(40.7110, -73.9920), (40.7045, -73.9895)], (40.6990, -73.9862)),
    ('Williamsburg Bridge', (40.7183, -73.9858), [(40.7152, -73.9760), (40.7125, -73.9670)], (40.7098, -73.9590)),
]


def projection(bid):
    lat0, lon0 = BOROUGHS[bid]['origin']
    R = math.radians(BOROUGHS[bid]['rot']); c, s = math.cos(R), math.sin(R)
    KX = 111320 * math.cos(math.radians(lat0))

    def proj(lat, lon):
        x, y = (lon - lon0) * KX, (lat - lat0) * KY
        return x * c - y * s, -(x * s + y * c)

    def unproj(X, Y):
        xr, yr = X, -Y
        x, y = xr * c + yr * s, -xr * s + yr * c
        return y / KY + lat0, x / KX + lon0
    return proj, unproj


def load(bid, name):
    return json.load(open(f'data/{bid}/{name}.json'))


def main():
    pm, _ = projection('manhattan')
    _, ub = projection('brooklyn')
    tr = lambda x, y: pm(*ub(x, y))  # noqa: E731  Brooklyn coords -> Manhattan coords
    r1 = lambda v: round(v, 1)  # noqa: E731

    M, B = load('manhattan', 'map'), load('brooklyn', 'map')
    q = B['q']
    island = max(M['islands'], key=len)
    on_man = prep(Polygon(island).buffer(30))

    def flat(f):
        out = []
        for i in range(0, len(f), 2):
            x, y = tr(f[i] / q, f[i + 1] / q)
            out += [round(x * q), round(y * q)]
        return out

    def keep(f):
        n = len(f) // 2
        cx, cy = sum(f[0::2]) / n / q, sum(f[1::2]) / n / q
        return not on_man.contains(Point(cx, cy))

    ring = lambda r: [[r1(v) for v in tr(x, y)] for x, y in r]  # noqa: E731
    green = [g for g in map(flat, B['green']) if keep(g)]
    water = [w for w in map(flat, B['water']) if keep(w)]
    bi = [i for i, f in enumerate(map(flat, B['buildings'])) if keep(f)]
    bflat = [flat(B['buildings'][i]) for i in bi]
    print(f"Brooklyn buildings kept {len(bi)}/{len(B['buildings'])}, green {len(green)}/{len(B['green'])}", file=sys.stderr)

    # street graph: drop Brooklyn's nodes that sit on Manhattan, then add the bridges
    MG, BG = load('manhattan', 'graph'), load('brooklyn', 'graph')
    off = len(MG['nodes'])
    bnodes = [[r1(v) for v in tr(x, y)] for x, y in BG['nodes']]
    drop = {i for i, (x, y) in enumerate(bnodes) if on_man.contains(Point(x, y))}
    nodes = MG['nodes'] + bnodes
    edges = list(MG['edges'])
    for e in BG['edges']:
        if e['a'] in drop or e['b'] in drop:
            continue
        edges.append({**e, 'a': e['a'] + off, 'b': e['b'] + off, 'p': [[r1(v) for v in tr(x, y)] for x, y in e['p']]})
    used = {e['a'] for e in edges} | {e['b'] for e in edges}
    print(f"Brooklyn nodes on Manhattan dropped: {len(drop)}", file=sys.stderr)

    def nearest(lo, hi, lat, lon):
        x, y = pm(lat, lon)
        return min((i for i in range(lo, hi) if i in used and i - off not in drop), key=lambda i: math.hypot(nodes[i][0] - x, nodes[i][1] - y))
    for name, ml, deck, bl in BRIDGES:
        a, b = nearest(0, off, *ml), nearest(off, len(nodes), *bl)
        edges.append({'a': a, 'b': b, 'p': [[r1(v) for v in pm(*p)] for p in deck], 'n': name, 'c': 3})
        print(f"{name}: {math.dist(nodes[a], pm(*ml)):.0f} m / {math.dist(nodes[b], pm(*bl)):.0f} m from the landings", file=sys.stderr)

    # places: re-project Brooklyn's, skip names Manhattan already has
    MP, BP = load('manhattan', 'places'), load('brooklyn', 'places')

    def reproj(p):
        x, y = pm(float(p['lat']), float(p['lon']))
        return {**p, 'x': r1(x), 'y': r1(y)}
    seen = {p['name'] for p in MP['landmarks'] + MP['targets']}
    places = {k: MP[k] + [reproj(p) for p in BP[k] if p['name'] not in seen] for k in ('landmarks', 'targets')}

    xs = [n[0] for n in nodes]; ys = [n[1] for n in nodes]
    meta = {**M['meta'], 'id': 'bridges', 'name': 'Manhattan + Brooklyn',
            'area': 'Cross the Brooklyn, Manhattan & Williamsburg Bridges', 'difficulty': 'Hard',
            'start': 'City Hall', 'task_max': 5000,  # starts next to the Brooklyn Bridge
            'bounds': [r1(min(xs)), r1(min(ys)), r1(max(xs)), r1(max(ys))]}
    out = {**M, 'meta': meta,
           'islands': M['islands'] + [ring(r) for r in B['islands']],
           'mainland': M['mainland'] + [ring(r) for r in B['mainland']],
           'green': M['green'] + green, 'water': M['water'] + water,
           'buildings': M['buildings'] + bflat}
    for k in ('bh', 'bc', 'wc', 'rc'):
        if k in M and k in B:
            out[k] = M[k] + [B[k][i] for i in bi]
    os.makedirs('data/bridges', exist_ok=True)
    for name, obj in (('map', out), ('graph', {**MG, 'nodes': nodes, 'edges': edges}), ('places', places)):
        json.dump(obj, open(f'data/bridges/{name}.json', 'w'), separators=(',', ':'))
    print(f"data/bridges: {len(out['buildings'])} buildings, {len(edges)} streets, "
          f"{len(places['landmarks'])} landmarks, {len(places['targets'])} targets", file=sys.stderr)


if __name__ == '__main__':
    main()
