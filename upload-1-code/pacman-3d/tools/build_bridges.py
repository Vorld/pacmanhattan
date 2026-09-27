"""Multi-borough maps, all in Manhattan's projection, joined by real crossings.

  bridges  Manhattan + Brooklyn over the Brooklyn, Manhattan and Williamsburg Bridges
  nyc      all five boroughs: those bridges, the Queensboro Bridge to Queens, the Macombs Dam and
           Third Avenue Bridges to the Bronx, and the Staten Island Ferry (edge class 4: the ghost
           rides it fast and chompers can't board)

Reads data/<borough>/ (run tools/build_borough.py and tools/color_buildings.py first), drops anything
of another borough's that sits on Manhattan, and writes data/bridges/ and data/nyc/.
Then run tools/build_lobby.py to add their lobby cards.
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
FERRY = 4

# (name, (borough, lat, lon), deck points over the water, (borough, lat, lon), edge class)
EAST_RIVER = [
    ('Brooklyn Bridge', ('manhattan', 40.7122, -74.0036), [(40.7075, -73.9985), (40.7045, -73.9950)], ('brooklyn', 40.6997, -73.9904), 3),
    ('Manhattan Bridge', ('manhattan', 40.7170, -73.9956), [(40.7110, -73.9920), (40.7045, -73.9895)], ('brooklyn', 40.6990, -73.9862), 3),
    ('Williamsburg Bridge', ('manhattan', 40.7183, -73.9858), [(40.7152, -73.9760), (40.7125, -73.9670)], ('brooklyn', 40.7098, -73.9590), 3),
]
OUTER = [
    ('Queensboro Bridge', ('manhattan', 40.7598, -73.9617), [(40.7570, -73.9540), (40.7535, -73.9460)], ('queens', 40.7508, -73.9398), 3),
    ('Macombs Dam Bridge', ('manhattan', 40.8290, -73.9360), [(40.8285, -73.9330)], ('bronx', 40.8280, -73.9290), 3),
    ('Third Avenue Bridge', ('manhattan', 40.8047, -73.9340), [(40.8070, -73.9318)], ('bronx', 40.8095, -73.9290), 3),
    ('Staten Island Ferry', ('manhattan', 40.7013, -74.0132), [(40.6870, -74.0230), (40.6690, -74.0470)], ('staten', 40.6437, -74.0736), FERRY),
]
MAPS = {
    'bridges': {'boroughs': ['manhattan', 'brooklyn'], 'links': EAST_RIVER,
                'name': 'Manhattan + Brooklyn', 'area': 'Cross the Brooklyn, Manhattan & Williamsburg Bridges',
                'start': 'City Hall', 'task_max': 5000},  # starts next to the Brooklyn Bridge
    'nyc': {'boroughs': ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten'], 'links': EAST_RIVER + OUTER,
            'name': 'All five boroughs', 'area': 'Bridges to Brooklyn, Queens & the Bronx, and the ferry to Staten Island',
            'start': 'Times Square', 'task_max': 6000},
}


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


def r1(v):
    return round(v, 1)


def build(out_id, spec):
    pm, _ = projection('manhattan')
    M = load('manhattan', 'map')
    island = max(M['islands'], key=len)
    on_man = prep(Polygon(island).buffer(30))
    out = {**M}
    for k in ('islands', 'mainland', 'green', 'water', 'buildings', 'bh', 'bc', 'wc', 'rc'):
        out[k] = list(M.get(k, []))
    MG = load('manhattan', 'graph')
    nodes, edges = list(MG['nodes']), list(MG['edges'])
    MP = load('manhattan', 'places')
    places = {k: list(MP[k]) for k in ('landmarks', 'targets')}
    seen = {p['name'] for p in MP['landmarks'] + MP['targets']}
    ranges = {'manhattan': (0, len(nodes))}

    for bid in spec['boroughs'][1:]:
        _, ub = projection(bid)
        tr = lambda x, y: pm(*ub(x, y))  # noqa: E731  borough coords -> Manhattan coords
        B = load(bid, 'map'); q = B['q']

        def flat(f):
            o = []
            for i in range(0, len(f), 2):
                x, y = tr(f[i] / q, f[i + 1] / q)
                o += [round(x * q), round(y * q)]
            return o

        def keep(f):
            n = len(f) // 2
            return not on_man.contains(Point(sum(f[0::2]) / n / q, sum(f[1::2]) / n / q))
        ring = lambda r: [[r1(v) for v in tr(x, y)] for x, y in r]  # noqa: E731
        out['islands'] += [ring(r) for r in B['islands']]
        out['mainland'] += [ring(r) for r in B['mainland']]
        out['green'] += [g for g in map(flat, B['green']) if keep(g)]
        out['water'] += [w for w in map(flat, B['water']) if keep(w)]
        bflat = [flat(f) for f in B['buildings']]
        bi = [i for i, f in enumerate(bflat) if keep(f)]
        out['buildings'] += [bflat[i] for i in bi]
        for k in ('bh', 'bc', 'wc', 'rc'):
            out[k] += [B[k][i] for i in bi] if k in B else [None] * len(bi)

        G = load(bid, 'graph')
        off = len(nodes)
        bn = [[r1(v) for v in tr(x, y)] for x, y in G['nodes']]
        drop = {i for i, (x, y) in enumerate(bn) if on_man.contains(Point(x, y))}
        nodes += bn
        edges += [{**e, 'a': e['a'] + off, 'b': e['b'] + off, 'p': [[r1(v) for v in tr(x, y)] for x, y in e['p']]}
                  for e in G['edges'] if e['a'] not in drop and e['b'] not in drop]
        ranges[bid] = (off, len(nodes))

        P = load(bid, 'places')
        for k in ('landmarks', 'targets'):
            for p in P[k]:
                if p['name'] in seen:
                    continue
                seen.add(p['name'])
                x, y = pm(float(p['lat']), float(p['lon']))
                places[k].append({**p, 'x': r1(x), 'y': r1(y)})
        print(f"  {bid}: {len(bi)}/{len(bflat)} buildings, {len(drop)} nodes on Manhattan dropped", file=sys.stderr)

    # crossings: snap each landing to the nearest street node of its borough
    used = {e['a'] for e in edges} | {e['b'] for e in edges}

    def nearest(bid, lat, lon):
        lo, hi = ranges[bid]
        x, y = pm(lat, lon)
        i = min((i for i in range(lo, hi) if i in used), key=lambda i: math.hypot(nodes[i][0] - x, nodes[i][1] - y))
        return i, math.hypot(nodes[i][0] - x, nodes[i][1] - y)
    for name, (ba, *la), deck, (bb, *lb), cls in spec['links']:
        a, da = nearest(ba, *la)
        b, db = nearest(bb, *lb)
        edges.append({'a': a, 'b': b, 'p': [[r1(v) for v in pm(*p)] for p in deck], 'n': name, 'c': cls})
        flag = '  <-- check' if max(da, db) > 250 else ''
        print(f"  {name}: landings {da:.0f} m / {db:.0f} m from a street{flag}", file=sys.stderr)

    # drop color arrays if any borough lacked them
    for k in ('wc', 'rc'):
        if any(v is None for v in out[k]):
            del out[k]
    xs = [n[0] for n in nodes]; ys = [n[1] for n in nodes]
    out['meta'] = {**M['meta'], 'id': out_id, 'name': spec['name'], 'area': spec['area'], 'difficulty': 'Hard',
                   'start': spec['start'], 'task_max': spec['task_max'],
                   'bounds': [r1(min(xs)), r1(min(ys)), r1(max(xs)), r1(max(ys))]}
    os.makedirs(f'data/{out_id}', exist_ok=True)
    for name, obj in (('map', out), ('graph', {'nodes': nodes, 'edges': edges}), ('places', places)):
        json.dump(obj, open(f'data/{out_id}/{name}.json', 'w'), separators=(',', ':'))
    print(f"data/{out_id}: {len(out['buildings'])} buildings, {len(edges)} streets, "
          f"{len(places['landmarks'])} landmarks, {len(places['targets'])} targets", file=sys.stderr)


def main():
    for out_id in (sys.argv[1:] or MAPS):
        print(out_id, file=sys.stderr)
        build(out_id, MAPS[out_id])


if __name__ == '__main__':
    main()
