// Downloads Manhattan's walkable street network from the Overpass API into
// data/raw/manhattan-streets.json. Run `npm run data:build` afterwards.
import { mkdir, writeFile } from 'node:fs/promises';

const MIRRORS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ];

// Streets the ghost can walk. Motorways (FDR, West Side Hwy ramps) and
// sidewalks/crossings are excluded: sidewalks duplicate streets and would turn
// every block into a double maze.
const HIGHWAYS = [
  'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'living_street', 'pedestrian', 'footway', 'path', 'cycleway',
  'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
].join('|');

const query = `
[out:json][timeout:180];
area["wikidata"="Q11299"]->.manhattan;
way["highway"~"^(${HIGHWAYS})$"]
   ["footway"!~"sidewalk|crossing"]
   ["access"!~"private|no"]
   ["area"!="yes"]
   ["tunnel"!="yes"]
   (area.manhattan);
out geom;
`;

async function download() {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'pacmanhattan-dev/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (res.ok) return await res.json();
        console.warn(`${url} returned ${res.status}, trying next mirror`);
      } catch (err) {
        console.warn(`${url} failed: ${err.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error('All Overpass mirrors failed');
}

const json = await download();
await mkdir('data/raw', { recursive: true });
await writeFile('data/raw/manhattan-streets.json', JSON.stringify(json));
console.log(`Saved ${json.elements.length} ways to data/raw/manhattan-streets.json`);
