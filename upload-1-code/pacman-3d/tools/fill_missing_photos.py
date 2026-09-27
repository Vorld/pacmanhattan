"""Fill in photos for places that have none: each place's Wikipedia lead image (up to 1280 px), with the
author and license from Wikimedia Commons, saved like the other photos in data/<borough>/img/.
Skips logos, seals and drawings. Run tools/build_bridges.py afterwards so the multi-borough maps pick them up.

  python3 tools/fill_missing_photos.py [--dry-run]
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from boroughs import ORDER
from wiki_titles import OVERRIDE
from PIL import Image

UA = {'User-Agent': 'PacManhattanBuild/0.4 (hackathon game data build; candy@melomed.io)'}
MAX_W, MAX_H = 1280, 960
ONLY = set(filter(None, os.environ.get('PM_ONLY', '').split('|')))  # optional allow-list of place names
SKIP = re.compile(r'logo|seal|emblem|coat_of_arms|wordmark|map|flag|icon|\.svg$', re.I)


def get(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (i + 1))
        except Exception:
            time.sleep(3 * (i + 1))
    return None


def clean(s):
    s = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s or '')).strip()
    return re.sub(r'^(.{4,}?)\1', r'\1', s)  # Commons repeats the name in a hidden span


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower().replace("'", '')).strip('-')


def main():
    dry = '--dry-run' in sys.argv
    report = []
    for b in ORDER:
        path = f'data/{b}/places.json'
        P = json.load(open(path))
        changed = False
        for p in P['landmarks'] + P['targets']:
            if p.get('img') or (ONLY and p['name'] not in ONLY):
                continue
            title = OVERRIDE.get(p['name'], p['name'])
            # find the article: exact title first, then Wikipedia search near the place's name
            api = 'https://en.wikipedia.org/w/api.php?'
            hit = json.loads(get(api + urllib.parse.urlencode({'action': 'query', 'titles': title, 'redirects': 1, 'format': 'json'})) or b'{}')
            pg = list(((hit.get('query') or {}).get('pages') or {}).values())
            if not pg or 'missing' in pg[0]:
                # no search fallback: search matched the wrong places (Battery Park for Rainey Park, portraits for parks)
                report.append((b, p['name'], 'no exact wikipedia article')); continue
            title = pg[0]['title']
            # the article's photos: lead image first, then the others, skipping logos, seals, maps and drawings
            imgs = json.loads(get(api + urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'pageimages|images', 'piprop': 'name', 'imlimit': 60, 'format': 'json'})) or b'{}')
            pg = list(((imgs.get('query') or {}).get('pages') or {}).values())
            cands = []
            if pg:
                if pg[0].get('pageimage'): cands.append(pg[0]['pageimage'])
                cands += [i['title'].split(':', 1)[1] for i in pg[0].get('images', [])]
            cands = [c for c in dict.fromkeys(cands) if re.search(r'\.jpe?g$', c, re.I) and not SKIP.search(c)]
            if not cands:
                report.append((b, p['name'], f'no usable photo in "{title}"')); continue
            fname = cands[0]
            q = urllib.parse.urlencode({'action': 'query', 'titles': 'File:' + fname, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime',
                                        'iiurlwidth': MAX_W, 'format': 'json'})
            info = json.loads(get('https://commons.wikimedia.org/w/api.php?' + q) or b'{}')
            pages = list(((info.get('query') or {}).get('pages') or {}).values())
            ii = (pages[0].get('imageinfo') or [{}])[0] if pages else {}
            if 'jpeg' not in ii.get('mime', '') and 'png' not in ii.get('mime', ''):
                report.append((b, p['name'], f"not a photo ({ii.get('mime')})")); continue
            em = ii.get('extmetadata', {})
            credit = clean(em.get('Artist', {}).get('value', ''))[:60]
            lic = clean(em.get('LicenseShortName', {}).get('value', ''))
            raw = get(ii.get('thumburl') or ii.get('url'))
            if not raw:
                report.append((b, p['name'], 'download failed')); continue
            im = Image.open(io.BytesIO(raw)).convert('RGB')
            im.thumbnail((MAX_W, MAX_H), Image.LANCZOS)
            rel = f'data/{b}/img/{slug(p["name"])}.jpg'
            if not dry:
                os.makedirs(f'data/{b}/img', exist_ok=True)
                im.save(rel, 'JPEG', quality=82, optimize=True, progressive=True)
                p['img'] = rel
                p['credit'] = f'{credit} {lic}'.strip() or 'Wikimedia Commons'
                p['file'] = ii.get('descriptionurl', '')
                if not p.get('wiki'):
                    p['wiki'] = 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))
                changed = True
            report.append((b, p['name'], f'ok {im.size[0]}x{im.size[1]} | {title} | {fname} | {credit} {lic}'))
            time.sleep(0.5)
        if changed:
            json.dump(P, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
    for r in report:
        print(' | '.join(r))


if __name__ == '__main__':
    main()
