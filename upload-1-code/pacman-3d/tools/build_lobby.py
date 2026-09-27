"""Render lobby preview maps and write data/boroughs.json.  Run after tools/build_borough.py for every borough."""
import json, os, io, base64, sys
sys.path.insert(0, os.path.dirname(__file__))
from boroughs import BOROUGHS, ORDER
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

def preview(bid):
    m = json.load(open(f'data/{bid}/map.json'))
    g = json.load(open(f'data/{bid}/graph.json'))
    x0, y0, x1, y1 = m['meta']['bounds']
    pad = 250
    W, H = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    fig = plt.figure(figsize=(9 * W / max(W, H), 9 * H / max(W, H)), dpi=150)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor('#9fd3ea')
    for r in m['mainland']:
        ax.fill([p[0] for p in r], [p[1] for p in r], color='#e2dbd0', lw=0)
    for r in m['islands']:
        ax.fill([p[0] for p in r], [p[1] for p in r], color='#f4efe6', lw=0)
    for p in m['green']:
        ax.fill([p[i] / 2 for i in range(0, len(p), 2)], [p[i] / 2 for i in range(1, len(p), 2)], color='#bfe6b0', lw=0)
    N = g['nodes']
    for e in g['edges']:
        pts = [N[e['a']]] + e['p'] + [N[e['b']]]
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color='#b9ae9e' if e['c'] < 3 else '#e8a33d', lw=0.45 if e['c'] < 3 else 1.0)
    ax.set_xlim(x0 - pad, x1 + pad); ax.set_ylim(y1 + pad, y0 - pad)
    ax.axis('off')
    buf = io.BytesIO(); fig.savefig(buf, format='png', facecolor='#9fd3ea'); plt.close(fig)
    im = Image.open(buf).convert('RGB')
    if bid in ('manhattan', 'bridges'):  # lay the island on its side so the card isn't a sliver
        im = im.rotate(90, expand=True)
    PW, PH = (1600, 560) if bid in ('manhattan', 'bridges') else (960, 600)   # 2x the size cards are shown at
    im.thumbnail((PW, PH), Image.LANCZOS)
    bg = Image.new('RGB', (PW, PH), (159, 211, 234))
    bg.paste(im, ((PW - im.width) // 2, (PH - im.height) // 2))
    os.makedirs('data/previews', exist_ok=True)
    path = f'data/previews/{bid}.jpg'
    bg.save(path, 'JPEG', quality=84, optimize=True, progressive=True)
    return path

def main():
    out = []
    for bid in ORDER + ['bridges']:  # bridges: tools/build_bridges.py
        if not os.path.exists(f'data/{bid}/map.json'):
            print('skip', bid, file=sys.stderr); continue
        m = json.load(open(f'data/{bid}/map.json'))['meta']
        pl = json.load(open(f'data/{bid}/places.json'))
        out.append({'id': bid, 'name': m['name'], 'area': m['area'], 'difficulty': m['difficulty'],
                    'landmarks': len(pl['landmarks']), 'targets': len(pl['targets']), 'preview': preview(bid)})
        print(bid, 'ok', file=sys.stderr)
    json.dump(out, open('data/boroughs.json', 'w'), separators=(',', ':'))
    print('data/boroughs.json', round(os.path.getsize('data/boroughs.json') / 1e3), 'KB', file=sys.stderr)

if __name__ == '__main__':
    main()
