"""Riddle clues for every place to find, written by Gemini from each place's own fact + Wikipedia summary.

  GEMINI_API_KEY=... python3 tools/make_riddles.py [borough ...] [--force]

Adds "riddle" to the targets in data/<borough>/places.json. Every riddle is checked before it is kept:
it must not contain any word of the place's name, and every number in it must appear in the source text
(so Gemini can't invent a year). A place whose riddle fails three times keeps no riddle and the game shows
its name as before. Run tools/build_bridges.py afterwards so the multi-borough maps pick them up.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from boroughs import BOROUGHS, ORDER  # noqa: E402

MODEL = 'gemini-3.1-flash-lite'  # generous free-tier limits; every riddle is checked anyway
URL = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'
CAT = {'R': 'restaurant', 'M': 'museum or cultural place', 'P': 'park or public space', 'L': 'monument or landmark'}
# words that may appear in a riddle even when they're part of the name
GENERIC = {'the', 'and', 'of', 'new', 'york', 'city', 'street', 'avenue', 'park', 'square', 'museum', 'center', 'centre',
           'house', 'hall', 'building', 'church', 'bridge', 'library', 'garden', 'gardens', 'restaurant', 'market',
           'theater', 'theatre', 'island', 'terminal', 'station', 'tower', 'place', 'plaza', 'pier', 'art', 'arts'}


def name_words(name):
    words = re.findall(r"[a-z0-9]+", name.lower().replace("'s", ''))
    return {w for w in words if len(w) >= 4 and w not in GENERIC}


def check(riddle, place, source):
    low = riddle.lower()
    bad = [w for w in name_words(place['name']) if re.search(r'\b' + re.escape(w), low)]
    if bad:
        return f'it uses words from the name ({", ".join(bad)})'
    nums = [n for n in re.findall(r'\d[\d,]*', riddle) if n.replace(',', '') not in source.replace(',', '')]
    if nums:
        return f'it uses numbers that are not in the source ({", ".join(nums)})'
    if len(riddle) > 170:
        return 'it is too long'
    return None


def ask(prompt, key):
    body = {'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.8, 'responseMimeType': 'application/json'}}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    for wait in (0, 15, 30, 45, 60, 60):  # free tier: back off on rate limits
        time.sleep(wait)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
    else:
        raise RuntimeError('still rate-limited')
    return json.loads(out['candidates'][0]['content']['parts'][0]['text'])['riddle'].strip()


def riddle_for(place, borough, key):
    source = f"{place.get('fact', '')} {place.get('about', '')}".strip()
    prompt = (
        "You write clues for a New York City scavenger-hunt game. Write ONE riddle-style clue (one sentence, at most 22 words) "
        f"that points to a {CAT.get(place.get('cat'), 'place')} in {BOROUGHS[borough]['name']}.\n"
        f"The answer is: {place['name']}\n"
        f"Use ONLY facts from this source text, nothing else:\n\"\"\"{source}\"\"\"\n"
        "Rules: never use the answer's name or any word from it; no numbers or years unless they appear in the source; "
        "playful but fair, so a curious New Yorker could solve it.\n"
        'Reply as JSON: {"riddle": "..."}'
    )
    feedback = ''
    for _ in range(3):
        try:
            r = ask(prompt + feedback, key)
        except Exception as e:  # network or format error: try again
            feedback = ''
            last = str(e)
            continue
        why = check(r, place, source)
        if not why:
            return r, None
        last = why
        feedback = f'\nYour last clue was rejected because {why}. Write a different one.'
    return None, last


def main():
    key = os.environ['GEMINI_API_KEY']
    force = '--force' in sys.argv
    boroughs = [a for a in sys.argv[1:] if not a.startswith('--')] or ORDER
    for b in boroughs:
        path = f'data/{b}/places.json'
        P = json.load(open(path))
        todo = [t for t in P['targets'] if force or not t.get('riddle')]
        failed = []

        def one(t):
            r, why = riddle_for(t, b, key)
            if r:
                t['riddle'] = r
            else:
                t.pop('riddle', None)
                failed.append(f"{t['name']}: {why}")
            json.dump(P, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)  # save as we go
        with ThreadPoolExecutor(3) as ex:
            list(ex.map(one, todo))
        print(f"{b}: {len(todo) - len(failed)}/{len(todo)} riddles", file=sys.stderr)
        for f in failed:
            print('  no riddle for', f, file=sys.stderr)


if __name__ == '__main__':
    main()
