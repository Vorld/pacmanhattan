"""Download OSM extracts for a neighborhood-sized borough map into raw/<id>/.  Usage: python3 tools/fetch_borough.py brooklyn"""
import os, sys, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from boroughs import BOROUGHS

def main(bid):
    b = BOROUGHS[bid]
    s, w, n, e = b['bbox']
    bb = f'({s},{w},{n},{e})'
    area = 3600000000 + b['rel']
    d = f'raw/{bid}'
    os.makedirs(d, exist_ok=True)
    head = f'[out:json][timeout:400];\narea({area})->.m;\n'
    Q = {
        'streets': head + f'way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|primary_link|secondary_link|tertiary_link)$"]["area"!="yes"]{bb}(area.m);\nout geom qt;\n',
        'parkpaths': head + f'way["leisure"="park"]{bb}(area.m)->.pk;\n.pk map_to_area->.pa;\nway["highway"~"^(footway|path|cycleway)$"]["footway"!~"sidewalk|crossing"](area.pa){bb};\nout geom qt;\n',
        'buildings': head + f'way["building"]{bb}(area.m);\nout geom qt;\n',
        'green': head + f'(way["leisure"~"^(park|garden|playground|pitch)$"]{bb}(area.m); rel["leisure"="park"]{bb}(area.m); way["landuse"~"^(grass|cemetery)$"]{bb}(area.m););\nout geom qt;\n',
        'water': f'[out:json][timeout:300];\n(way["natural"="water"]{bb}; rel["natural"="water"]{bb};);\nout geom qt;\n',
        'coast': f'[out:json][timeout:300];\nway["natural"="coastline"]({s-0.03},{w-0.03},{n+0.03},{e+0.03});\nout geom qt;\n',
        'boundary': f'[out:json][timeout:300];\nrel({b["rel"]});\nout geom;\n',
    }
    for k, q in Q.items():
        out = f'{d}/{k}.json'
        if os.path.exists(out):
            continue
        qf = f'{d}/q_{k}.txt'
        open(qf, 'w').write(q)
        r = subprocess.run(['bash', 'raw/fetch.sh', qf, out])
        print(bid, k, 'ok' if r.returncode == 0 else 'FAILED', flush=True)

if __name__ == '__main__':
    for bid in sys.argv[1:]:
        main(bid)
