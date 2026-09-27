"""Narrator voice lines, recorded once with ElevenLabs and shipped as mp3s (no API key in the game).

  ELEVENLABS_API_KEY=... python3 tools/make_voice.py [--force]

Writes data/voice/<id>.mp3 for every line below; src/voice.js plays them.
"""
import json
import os
import sys
import urllib.request

VOICE = 'FGY2WhTYpPnrIDTdsKH5'  # Laura: enthusiast, quirky attitude
MODEL = 'eleven_multilingual_v2'
LINES = {
    'welcome': "Welcome to Pac-Manhattan! You're the ghost, and New York is the maze.",
    'start': "Here's your riddle. Find the place, and don't get chomped!",
    'start-plain': "Find the place, and don't get chomped!",
    'landmark': "Ooh, a landmark! Here's your hint.",
    'found': "You found it!",
    'solved': "Riddle solved! Bonus points, genius.",
    'chomper': "Uh oh. Another chomper just joined the hunt.",
    'behind': "Behind you! Run!",
    'ferry': "All aboard the Staten Island Ferry! Chompers can't swim.",
    'chomped': "Chomped! That's game over.",
    'bridge-brooklyn-bridge': "Crossing the Brooklyn Bridge!",
    'bridge-manhattan-bridge': "Crossing the Manhattan Bridge!",
    'bridge-williamsburg-bridge': "Crossing the Williamsburg Bridge!",
    'bridge-queensboro-bridge': "Over the Queensboro Bridge, next stop Queens!",
    'bridge-macombs-dam-bridge': "Over the Macombs Dam Bridge, hello Bronx!",
    'bridge-third-avenue-bridge': "Over the Third Avenue Bridge, hello Bronx!",
}


def main():
    key = os.environ['ELEVENLABS_API_KEY']
    force = '--force' in sys.argv
    os.makedirs('data/voice', exist_ok=True)
    chars = 0
    for vid, text in LINES.items():
        path = f'data/voice/{vid}.mp3'
        if os.path.exists(path) and not force:
            continue
        body = {'text': text, 'model_id': MODEL, 'voice_settings': {'stability': 0.4, 'similarity_boost': 0.8, 'style': 0.45}}
        req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_64',
                                     data=json.dumps(body).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', 'xi-api-key': key, 'Accept': 'audio/mpeg'})
        with urllib.request.urlopen(req, timeout=60) as r:
            open(path, 'wb').write(r.read())
        chars += len(text)
        print(f'{vid}: {os.path.getsize(path) // 1024} KB', file=sys.stderr)
    print(f'{chars} characters used', file=sys.stderr)


if __name__ == '__main__':
    main()
