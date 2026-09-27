"""Fetch a photo, short summary, and photo credit from Wikipedia for each place.

Three passes, gentle on Wikimedia's servers:
  1. page summaries (REST API)          -> about text, page URL, lead image file name
  2. image credits in batches of 40     -> artist, license, a standard-size thumbnail URL
  3. thumbnail downloads (330 px wide, a size Wikimedia pre-renders)

Writes build/wiki.json and build/img/<slug>.jpg.  Run: python3 tools/fetch_wiki.py
"""
import json, os, re, sys, time, math, io, urllib.parse, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(__file__))
from places import LANDMARKS, TARGETS
from wiki_titles import OVERRIDE
from PIL import Image

UA = {'User-Agent': 'PacManhattanBuild/0.3 (hobby game data build; tyler@meetneptune.com)'}
THUMB_W = 330
os.makedirs('build/img', exist_ok=True)

def get(url):
    for i in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            wait = int(e.headers.get('Retry-After') or 0) or (4 * (i + 1))
            print(f'    {e.code}, waiting {wait}s', file=sys.stderr)
            time.sleep(min(wait, 60))
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError('gave up on ' + url)

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def clean_html(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s or '')).strip()

def first_sentences(text, n=2, limit=300):
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    out = ''
    for p in parts[:n]:
        if len(out) + len(p) > limit and out:
            break
        out += (' ' if out else '') + p
    return out

def main():
    out = json.load(open('build/wiki.json')) if os.path.exists('build/wiki.json') else {}
    allp = [(p[0], p[1], p[2]) for p in LANDMARKS] + [(t[0], t[1], t[2]) for t in TARGETS]

    # pass 1: summaries, 20 pages per request via the action API
    todo = [(n, la, lo) for n, la, lo in allp if not out.get(n, {}).get('summary_done')]
    for i in range(0, len(todo), 20):
        batch = todo[i:i + 20]
        titles = '|'.join(OVERRIDE.get(n, n) for n, _, _ in batch)
        q = json.loads(get('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1'
                           '&prop=extracts|pageimages|coordinates|info&inprop=url&exintro=1&explaintext=1'
                           '&piprop=original|name&pilicense=any&titles=' + urllib.parse.quote(titles)))['query']
        alias = {}
        for key in ('normalized', 'redirects'):
            for x in q.get(key, []):
                alias[x['from']] = x['to']
        pages = {p.get('title'): p for p in q.get('pages', {}).values()}
        for name, lat, lon in batch:
            t = OVERRIDE.get(name, name)
            while t in alias:
                t = alias[t]
            p = pages.get(t) or {}
            rec = out.get(name, {})
            rec['title'] = t
            if 'missing' not in p and p:
                c = (p.get('coordinates') or [None])[0]
                ext = p.get('extract', '')
                if 'may refer to' not in ext and (not c or math.hypot((c['lat'] - lat) * 110540, (c['lon'] - lon) * 84300) < 2500):
                    rec['about'] = first_sentences(ext)
                rec['url'] = p.get('fullurl')
                fname = p.get('pageimage')
                if fname and not fname.lower().endswith(('.svg', '.png', '.gif', '.tif', '.tiff')):
                    rec['fname'] = fname.replace('_', ' ')
            else:
                print('  missing page', name, t, file=sys.stderr)
            rec['summary_done'] = True
            out[name] = rec
        json.dump(out, open('build/wiki.json', 'w'), indent=1)
        time.sleep(1)
    print('pass 1 done', file=sys.stderr)

    # pass 2: credits + thumb URLs in batches
    need = [n for n, r in out.items() if r.get('fname') and not r.get('thumb')]
    for i in range(0, len(need), 40):
        batch = need[i:i + 40]
        titles = '|'.join('File:' + out[n]['fname'] for n in batch)
        meta = json.loads(get('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
                              f'&iiprop=extmetadata|url&iiurlwidth={THUMB_W}&titles=' + urllib.parse.quote(titles)))
        norm = {x['from']: x['to'] for x in meta['query'].get('normalized', [])}
        pages = {p['title']: p for p in meta['query']['pages'].values()}
        for n in batch:
            t = 'File:' + out[n]['fname']
            p = pages.get(norm.get(t, t)) or {}
            ii = (p.get('imageinfo') or [{}])[0]
            em = ii.get('extmetadata', {})
            out[n]['thumb'] = ii.get('thumburl')
            out[n]['credit'] = clean_html(em.get('Artist', {}).get('value', ''))[:80]
            out[n]['license'] = clean_html(em.get('LicenseShortName', {}).get('value', ''))
            out[n]['file'] = ii.get('descriptionurl') or ''
        json.dump(out, open('build/wiki.json', 'w'), indent=1)
        time.sleep(1)
    print('pass 2 done', file=sys.stderr)

    # pass 3: thumbnails
    for n, r in out.items():
        if not r.get('thumb') or (r.get('img') and os.path.exists(r['img'])):
            continue
        try:
            data = get(r['thumb'])
            im = Image.open(io.BytesIO(data)).convert('RGB')
            im.thumbnail((THUMB_W, 300))
            path = 'build/img/' + slug(n) + '.jpg'
            im.save(path, 'JPEG', quality=78, optimize=True, progressive=True)
            r['img'] = path
            print(n, '-> img', file=sys.stderr)
        except Exception as e:
            print('  img fail', n, e, file=sys.stderr)
        json.dump(out, open('build/wiki.json', 'w'), indent=1)
        time.sleep(1.2)
    ok = sum(1 for r in out.values() if r.get('img'))
    print('images', ok, '/', len(out), file=sys.stderr)

if __name__ == '__main__':
    main()
