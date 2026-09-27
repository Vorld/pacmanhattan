// Manhattan + Brooklyn on one map. index.html loads Manhattan's data into PM_PARTS.manhattan,
// then Brooklyn's into PM_DATA; this moves Brooklyn into Manhattan's coordinates (same projection as
// tools/city.py), drops Brooklyn's copies of Manhattan parks, and joins the street graphs with the
// three East River bridges you can walk across.
(function () {
  const M = window.PM_PARTS.manhattan, B = window.PM_DATA;
  const KY = 110540;
  const mk = (lat0, lon0, deg) => {
    const R = (deg * Math.PI) / 180, c = Math.cos(R), s = Math.sin(R), KX = 111320 * Math.cos((lat0 * Math.PI) / 180);
    return {
      proj: (lat, lon) => { const x = (lon - lon0) * KX, y = (lat - lat0) * KY; return [x * c - y * s, -(x * s + y * c)]; },
      unproj: (X, Y) => { const xr = X, yr = -Y, x = xr * c + yr * s, y = -xr * s + yr * c; return [y / KY + lat0, x / KX + lon0]; },
    };
  };
  const man = mk(40.758, -73.9855, 29), bk = mk(40.6743, -73.9701, 0);
  const tr = (x, y) => { const [lat, lon] = bk.unproj(x, y); return man.proj(lat, lon); };
  const r1 = (v) => Math.round(v * 10) / 10;
  const ring = (r) => r.map(([x, y]) => tr(x, y).map(r1));
  const q = B.map.q || 2;
  const flat = (f) => { const o = new Array(f.length); for (let i = 0; i < f.length; i += 2) { const [x, y] = tr(f[i] / q, f[i + 1] / q); o[i] = Math.round(x * q); o[i + 1] = Math.round(y * q); } return o; };

  // point-in-Manhattan test (largest island ring, already in Manhattan coordinates)
  const isl = M.map.islands.reduce((a, r) => (r.length > a.length ? r : a), []);
  const inMan = (x, y) => { let inside = false; for (let i = 0, j = isl.length - 1; i < isl.length; j = i++) { const [xi, yi] = isl[i], [xj, yj] = isl[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
  const keepFlat = (f) => !inMan(f[0] / q, f[1] / q);

  const bm = B.map, mm = M.map;
  const bGreen = bm.green.map(flat).filter(keepFlat), bWater = bm.water.map(flat).filter(keepFlat);
  const map = {
    ...mm,
    city: 'Manhattan + Brooklyn',
    islands: [...mm.islands, ...bm.islands.map(ring)],
    mainland: [...mm.mainland, ...bm.mainland.map(ring)],
    green: [...mm.green, ...bGreen],
    water: [...mm.water, ...bWater],
    buildings: [...mm.buildings, ...bm.buildings.map(flat)],
    bh: [...mm.bh, ...bm.bh], bc: [...mm.bc, ...bm.bc],
    wc: [...mm.wc, ...bm.wc], rc: [...mm.rc, ...bm.rc],
  };
  // play area covers both boroughs (world ground tiles + minimap use it)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  isl.forEach(([x, y]) => grow(x, y));

  // street graph
  const off = M.graph.nodes.length;
  const bNodes = B.graph.nodes.map(([x, y]) => tr(x, y).map(r1));
  bNodes.forEach(([x, y]) => grow(x, y));
  map.box = [x0, y0, x1, y1];
  const nodes = [...M.graph.nodes, ...bNodes];
  const edges = [...M.graph.edges, ...B.graph.edges.map((e) => ({ ...e, a: e.a + off, b: e.b + off, p: e.p.map(([x, y]) => tr(x, y).map(r1)) }))];
  const nearest = (lo, hi, lat, lon) => { const [x, y] = man.proj(lat, lon); let best = -1, bd = Infinity; for (let i = lo; i < hi; i++) { const d = Math.hypot(nodes[i][0] - x, nodes[i][1] - y); if (d < bd) { bd = d; best = i; } } return best; };
  // [name, Manhattan landing, deck points over the river, Brooklyn landing] (lat, lon)
  const BRIDGES = [
    ['Brooklyn Bridge', [40.7122, -74.0036], [[40.7075, -73.9985], [40.7045, -73.9950]], [40.6997, -73.9904]],
    ['Manhattan Bridge', [40.7170, -73.9956], [[40.7110, -73.9920], [40.7045, -73.9895]], [40.6990, -73.9862]],
    ['Williamsburg Bridge', [40.7183, -73.9858], [[40.7152, -73.9760], [40.7125, -73.9670]], [40.7098, -73.9590]],
  ];
  for (const [n, ml, deck, bl] of BRIDGES) {
    const a = nearest(0, off, ...ml), b = nearest(off, nodes.length, ...bl);
    edges.push({ a, b, p: deck.map(([lat, lon]) => man.proj(lat, lon).map(r1)), n, c: 3 });
  }

  // places: re-project Brooklyn's from lat/lon, skip names Manhattan already has
  const reproj = (p) => { const [x, y] = man.proj(p.lat, p.lon); return { ...p, x: r1(x), y: r1(y) }; };
  const seen = new Set([...M.places.landmarks, ...M.places.targets].map((p) => p.name));
  const places = {
    landmarks: [...M.places.landmarks, ...B.places.landmarks.filter((p) => !seen.has(p.name)).map(reproj)],
    targets: [...M.places.targets, ...B.places.targets.filter((p) => !seen.has(p.name)).map(reproj)],
  };
  window.PM_DATA = { map, graph: { nodes, edges }, places };
  delete window.PM_PARTS;
})();
