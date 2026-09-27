"""Per-borough settings for the data pipeline. Pick one with PM_CITY (default: manhattan).

  PM_CITY=brooklyn python3 tools/build_graph.py --land && PM_CITY=brooklyn python3 tools/build_data.py

Manhattan keeps its original paths (raw/, build/, data/) so the existing pipeline is unchanged.
Other boroughs write to raw/<city>/, build/<city>/ and data/<city>/.
"""
import os

CITIES = {
    'manhattan': {
        'name': 'Manhattan',
        'relation': 8398124,
        'origin': (40.758, -73.9855),   # Times Square
        'rot_deg': 29.0,                # avenues run straight up the screen
        'bbox': (40.68, -74.03, 40.89, -73.90),
        'raw': 'raw/', 'build': 'build/', 'out': 'data/',
        'land_from_ntas': False,        # land comes from the OSM coastline (Manhattan is an island)
        'places': 'places',
        'pluto_prefix': '1',
    },
    'brooklyn': {
        'name': 'Brooklyn',
        'relation': 9691750,
        'origin': (40.6743, -73.9701),  # Grand Army Plaza
        'rot_deg': 0.0,                 # no single street grid: north stays up
        'bbox': (40.640, -74.030, 40.740, -73.900),  # north + west Brooklyn play area
        'raw': 'raw/brooklyn/', 'build': 'build/brooklyn/', 'out': 'data/brooklyn/',
        'land_from_ntas': True,         # Brooklyn is part of Long Island: use NYC's shoreline-clipped boundaries
        'places': 'places_brooklyn',
        'pluto_prefix': '3',
    },
}

KEY = os.environ.get('PM_CITY', 'manhattan').lower()
C = CITIES[KEY]
