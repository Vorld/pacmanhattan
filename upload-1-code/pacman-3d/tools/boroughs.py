"""Borough map definitions. Manhattan is the whole island; the others are neighborhood-sized maps."""

BOROUGHS = {
    'manhattan': {
        'name': 'Manhattan', 'area': 'The whole island', 'rel': 8398124,
        'bbox': None, 'origin': (40.758, -73.9855), 'rot': 29.0, 'grid_words': True,
        'difficulty': 'Hard', 'speed': 1.0, 'start': 'Times Square',
        'task_min': 900, 'task_max': 4200, 'first_max': 2800,
    },
    'brooklyn': {
        'name': 'Brooklyn', 'area': 'Downtown, DUMBO, Fort Greene & Williamsburg', 'rel': 9691750,
        'bbox': (40.666, -74.004, 40.722, -73.945), 'origin': (40.6928, -73.9903), 'rot': 0.0, 'grid_words': False,
        'difficulty': 'Medium', 'speed': 0.95, 'start': 'Brooklyn Borough Hall',
        'task_min': 700, 'task_max': 3600, 'first_max': 2400,
    },
    'queens': {
        'name': 'Queens', 'area': 'Long Island City & Astoria', 'rel': 9691819,
        'bbox': (40.735, -73.965, 40.786, -73.900), 'origin': (40.7470, -73.9435), 'rot': 0.0, 'grid_words': False,
        'difficulty': 'Easy', 'speed': 0.9, 'start': 'One Court Square',
        'task_min': 700, 'task_max': 3600, 'first_max': 2400,
    },
    'bronx': {
        'name': 'The Bronx', 'area': 'South Bronx, the Grand Concourse & Bronx Zoo', 'rel': 9691916,
        'bbox': (40.805, -73.935, 40.867, -73.870), 'origin': (40.8296, -73.9262), 'rot': 0.0, 'grid_words': False,
        'difficulty': 'Medium', 'speed': 0.95, 'start': 'Yankee Stadium',
        'task_min': 700, 'task_max': 4000, 'first_max': 2600,
    },
    'staten': {
        'name': 'Staten Island', 'area': 'St. George & the North Shore', 'rel': 9691948,
        'bbox': (40.600, -74.125, 40.650, -74.052), 'origin': (40.6437, -74.0736), 'rot': 0.0, 'grid_words': False,
        'difficulty': 'Easy', 'speed': 0.9, 'start': 'St. George Terminal',
        'task_min': 600, 'task_max': 3600, 'first_max': 2400,
    },
}

ORDER = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten']
