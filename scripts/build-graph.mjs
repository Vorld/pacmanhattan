// Turns raw OSM ways (data/raw/manhattan-streets.json) into the game's street
// graph (public/data/manhattan-graph.json) and snaps curated places
// (data/places.json) to their nearest graph node (public/data/places.json).
//
// Graph format (compact, ~1–2 MB):
//   nodes: flat [lon, lat, lon, lat, ...] at 6-decimal precision
//   edges: [a, b, nameIndex, [lon, lat, ...intermediate points]]
//   names: street name table
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const RAW = 'data/raw/manhattan-streets.json';
const PLACES_IN = 'data/places.json';
const GRAPH_OUT = 'public/data/manhattan-graph.json';
const PLACES_OUT = 'public/data/places.json';

const DANGLING_STUB_M = 40; // prune dead-end spurs shorter than this
const SIMPLIFY_M = 1.5; // Douglas-Peucker tolerance
const MAX_SNAP_M = 150; // a place further than this from any street is a data error

const LAT0 = 40.78;
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const toXY = (lon, lat) => [lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT];
const dist = (a, b) => Math.hypot((a[0] - b[0]) * M_PER_DEG_LON, (a[1] - b[1]) * M_PER_DEG_LAT);

const raw = JSON.parse(await readFile(RAW, 'utf8'));

// --- 1. Filter ways ---------------------------------------------------------
const ways = raw.elements.filter((w) => {
  const t = w.tags ?? {};
  if (t.indoor || t.level?.startsWith('-')) return false; // station corridors etc.
  if (Number(t.layer) < 0) return false;
  if (t.footway === 'access_aisle') return false;
  if (t.highway === 'footway' && t.bridge !== 'yes' && !t.name && t.footway) return false;
  return w.geometry?.length >= 2;
});

// --- 2. Split ways into edges at shared OSM nodes ---------------------------
const usage = new Map();
for (const w of ways) {
  w.nodes.forEach((id, i) => {
    const endpoint = i === 0 || i === w.nodes.length - 1;
    usage.set(id, (usage.get(id) ?? 0) + (endpoint ? 2 : 1));
  });
}

const coordOf = new Map(); // osm id -> [lon, lat]
const adj = new Map(); // osm id -> Set(edgeId)
const edges = []; // { a, b, pts: [[lon,lat]...], name, alive }

function addEdge(a, b, pts, name) {
  if (a === b && pts.length < 3) return;
  const id = edges.length;
  edges.push({ a, b, pts, name, alive: true });
  if (!adj.has(a)) adj.set(a, new Set());
  if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a).add(id);
  adj.get(b).add(id);
}

for (const w of ways) {
  const name = w.tags.name ?? '';
  let start = 0;
  for (let i = 0; i < w.nodes.length; i++) {
    coordOf.set(w.nodes[i], [w.geometry[i].lon, w.geometry[i].lat]);
    if (i > 0 && (usage.get(w.nodes[i]) > 1 || i === w.nodes.length - 1)) {
      const pts = w.geometry.slice(start, i + 1).map((g) => [g.lon, g.lat]);
      addEdge(w.nodes[start], w.nodes[i], pts, name);
      start = i;
    }
  }
}

const edgeLen = (e) => {
  let s = 0;
  for (let i = 1; i < e.pts.length; i++) s += dist(e.pts[i - 1], e.pts[i]);
  return s;
};
const liveDegree = (n) => adj.get(n)?.size ?? 0;
function killEdge(id) {
  const e = edges[id];
  e.alive = false;
  adj.get(e.a)?.delete(id);
  adj.get(e.b)?.delete(id);
}

// --- 3. Keep only the largest connected component ---------------------------
function largestComponent() {
  const seen = new Map();
  let best = null;
  for (const start of adj.keys()) {
    if (seen.has(start) || liveDegree(start) === 0) continue;
    const comp = [start];
    seen.set(start, true);
    for (let i = 0; i < comp.length; i++) {
      for (const eid of adj.get(comp[i])) {
        const e = edges[eid];
        const other = e.a === comp[i] ? e.b : e.a;
        if (!seen.has(other)) {
          seen.set(other, true);
          comp.push(other);
        }
      }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  return new Set(best);
}
let keep = largestComponent();
edges.forEach((e, id) => {
  if (e.alive && !keep.has(e.a)) killEdge(id);
});

// --- 4. Prune short dangling spurs (repeat until stable) ---------------------
for (let changed = true; changed; ) {
  changed = false;
  edges.forEach((e, id) => {
    if (!e.alive || e.a === e.b) return;
    const deadEnd = liveDegree(e.a) === 1 || liveDegree(e.b) === 1;
    if (deadEnd && edgeLen(e) < DANGLING_STUB_M) {
      killEdge(id);
      changed = true;
    }
  });
}

// --- 5. Merge degree-2 pass-through nodes into longer edges -----------------
for (const [node, set] of adj) {
  if (set.size !== 2) continue;
  const [i, j] = [...set];
  const e1 = edges[i];
  const e2 = edges[j];
  if (e1.a === e1.b || e2.a === e2.b) continue;
  const other1 = e1.a === node ? e1.b : e1.a;
  const other2 = e2.a === node ? e2.b : e2.a;
  if (other1 === other2) continue; // would create a self-loop pair; keep node
  const p1 = e1.b === node ? e1.pts : [...e1.pts].reverse(); // ends at node
  const p2 = e2.a === node ? e2.pts : [...e2.pts].reverse(); // starts at node
  killEdge(i);
  killEdge(j);
  addEdge(other1, other2, [...p1, ...p2.slice(1)], e1.name || e2.name);
}

// --- 6. Simplify geometry ----------------------------------------------------
function simplify(pts) {
  if (pts.length <= 2) return pts;
  const [f, l] = [pts[0], pts[pts.length - 1]];
  if (f[0] === l[0] && f[1] === l[1]) {
    // Closed loop: simplify each half so the loop can't collapse to a point.
    const mid = pts.length >> 1;
    return [...simplify(pts.slice(0, mid + 1)), ...simplify(pts.slice(mid)).slice(1)];
  }
  const xy = pts.map(([lon, lat]) => toXY(lon, lat));
  const keepIdx = new Uint8Array(pts.length);
  keepIdx[0] = keepIdx[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = xy[s];
    const [bx, by] = xy[e];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let maxD = 0;
    let idx = -1;
    for (let k = s + 1; k < e; k++) {
      const d = Math.abs((bx - ax) * (ay - xy[k][1]) - (ax - xy[k][0]) * (by - ay)) / len;
      if (d > maxD) [maxD, idx] = [d, k];
    }
    if (maxD > SIMPLIFY_M) {
      keepIdx[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, k) => keepIdx[k]);
}

// --- 7. Split edges at each curated place's closest street point ----------
// Places become real graph nodes, so arrival is "ghost reaches node X".
const places = JSON.parse(await readFile(PLACES_IN, 'utf8'));
let bad = 0;
function closestOnEdges(lon, lat) {
  const p = toXY(lon, lat);
  let best = null;
  edges.forEach((e, id) => {
    if (!e.alive) return;
    for (let i = 1; i < e.pts.length; i++) {
      const a = toXY(...e.pts[i - 1]);
      const b = toXY(...e.pts[i]);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
      if (!best || d < best.d) best = { d, id, seg: i, t };
    }
  });
  return best;
}
function snapPlace(place) {
  const hit = closestOnEdges(place.lon, place.lat);
  if (hit.d > MAX_SNAP_M) {
    console.error(`  ✗ ${place.name} is ${hit.d.toFixed(0)} m from the nearest street`);
    bad++;
  }
  const e = edges[hit.id];
  const { seg, t } = hit;
  const a = e.pts[seg - 1];
  const b = e.pts[seg];
  const pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  let osmId;
  if (t === 0 && seg === 1) osmId = e.a;
  else if (t === 1 && seg === e.pts.length - 1) osmId = e.b;
  else {
    osmId = `place:${place.id}`;
    coordOf.set(osmId, pt);
    const before = [...e.pts.slice(0, seg), pt];
    const after = [pt, ...e.pts.slice(seg)];
    killEdge(hit.id);
    addEdge(e.a, osmId, before, e.name);
    addEdge(osmId, e.b, after, e.name);
  }
  return { place, osmId, snapDistance: Math.round(hit.d) };
}
const snapped = {
  landmarks: places.landmarks.map(snapPlace),
  targets: places.targets.map(snapPlace),
};

// --- 7. Emit compact graph ---------------------------------------------------
const live = edges.filter((e) => e.alive);
const nodeIndex = new Map();
const nodes = [];
const idx = (osmId) => {
  if (!nodeIndex.has(osmId)) {
    nodeIndex.set(osmId, nodes.length / 2);
    const [lon, lat] = coordOf.get(osmId);
    nodes.push(+lon.toFixed(6), +lat.toFixed(6));
  }
  return nodeIndex.get(osmId);
};
const names = [''];
const nameIdx = new Map([['', 0]]);
const outEdges = live.map((e) => {
  if (!nameIdx.has(e.name)) {
    nameIdx.set(e.name, names.length);
    names.push(e.name);
  }
  const inner = simplify(e.pts).slice(1, -1).flatMap(([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)]);
  return [idx(e.a), idx(e.b), nameIdx.get(e.name), inner];
});

await mkdir('public/data', { recursive: true });
await writeFile(GRAPH_OUT, JSON.stringify({ city: 'manhattan', nodes, edges: outEdges, names }));
const nodeCount = nodes.length / 2;
console.log(`Graph: ${nodeCount} nodes, ${outEdges.length} edges, ${names.length} street names`);

// --- 8. Emit places with their graph node ---------------------------------
const toOut = ({ place, osmId, snapDistance }) => ({ ...place, node: idx(osmId), snapDistance });
const out = { landmarks: snapped.landmarks.map(toOut), targets: snapped.targets.map(toOut) };
await writeFile(PLACES_OUT, JSON.stringify(out, null, 1));
const worst = [...out.landmarks, ...out.targets].sort((x, y) => y.snapDistance - x.snapDistance)[0];
console.log(`Places: ${out.landmarks.length} landmarks, ${out.targets.length} targets (farthest snap: ${worst.name}, ${worst.snapDistance} m)`);
if (bad) process.exit(1);
