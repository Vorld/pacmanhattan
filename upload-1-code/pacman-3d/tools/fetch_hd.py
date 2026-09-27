"""Download HD versions (up to 1280 px) of the place photos found by tools/fetch_wiki.py.

  python3 tools/fetch_hd.py manhattan brooklyn queens bronx staten

Saves build/img_hd/<borough>/<slug>.jpg and records the path as 'hd' in that borough's wiki cache.
"""
import io, json, os, re, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(__file__))
from fetch_wiki import get, slug, UA
from PIL import Image

MAX_W, MAX_H = 1280, 960

def cache_path(bid):
    return 'build/wiki.json' if bid == 'manhattan' else f'build/{bid}/wiki.json'

def candidates(thumb):
    """Standard Wikimedia thumbnail sizes, largest first, then the original file."""
    out = []
    if thumb and '/thumb/' in thumb:
        for w in (1280, 960):
            out.append(re.sub(r'/(\d+)px-', f'/{w}px-', thumb))
        orig = thumb.replace('/thumb/', '/').rsplit('/', 1)[0]
        out.append(orig)
    elif thumb:
        out.append(thumb)
    return out

def main(bid):
    cp = cache_path(bid)
    data = json.load(open(cp))
    d = f'build/img_hd/{bid}'
    os.makedirs(d, exist_ok=True)
    ok = 0
    for name, r in data.items():
        if not r.get('thumb'):
            continue
        path = f'{d}/{slug(name)}.jpg'
        if os.path.exists(path):
            r['hd'] = path; ok += 1
            continue
        for url in candidates(r['thumb']):
            try:
                raw = get(url)
                im = Image.open(io.BytesIO(raw))
                im = im.convert('RGB')
                im.thumbnail((MAX_W, MAX_H), Image.LANCZOS)
                im.save(path, 'JPEG', quality=82, optimize=True, progressive=True)
                r['hd'] = path; ok += 1
                print(bid, name, im.size, file=sys.stderr)
                break
            except Exception as e:
                print('   ', name, 'failed', url.rsplit('/', 1)[-1][:40], e, file=sys.stderr)
        json.dump(data, open(cp, 'w'), indent=1)
        time.sleep(1.0)
    print(bid, 'HD photos', ok, file=sys.stderr)

if __name__ == '__main__':
    for b in sys.argv[1:]:
        main(b)
