"""Tag every place with its NYC neighborhood (2020 NTA code + name) so the game can ask Tiger Data for that
neighborhood's rent history and the buildings around it (api/block.js).

  python3 tools/tag_nta.py <nta2020.geojson>

NTA boundaries: NYC Department of City Planning, "2020 Neighborhood Tabulation Areas".
Run tools/build_bridges.py afterwards so the multi-borough maps pick the tags up.
"""
import json
import sys

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.path.insert(0, __import__('os').path.dirname(__file__))
from boroughs import ORDER  # noqa: E402


def main():
    feats = json.load(open(sys.argv[1]))['features']
    polys = [shape(f['geometry']) for f in feats]
    tree = STRtree(polys)
    for b in ORDER:
        path = f'data/{b}/places.json'
        P = json.load(open(path))
        miss = []
        for p in P['landmarks'] + P['targets']:
            pt = Point(float(p['lon']), float(p['lat']))
            hit = [i for i in tree.query(pt) if polys[i].contains(pt)]
            if not hit:
                hit = [tree.nearest(pt)]  # a pier or shoreline spot just outside every boundary
                miss.append(p['name'])
            props = feats[hit[0]]['properties']
            p['nta'], p['ntaname'] = props['nta2020'], props['ntaname']
        json.dump(P, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
        print(f"{b}: tagged {len(P['landmarks']) + len(P['targets'])} places ({len(miss)} snapped to the nearest area)", file=sys.stderr)


if __name__ == '__main__':
    main()
