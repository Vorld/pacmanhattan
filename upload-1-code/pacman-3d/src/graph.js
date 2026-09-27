// Street graph: movement, nearest-point lookup, and pathfinding.
(function () {
  const PM = (window.PM = window.PM || {});

  class Graph {
    constructor(data) {
      const n = data.nodes.length;
      this.nx = new Float32Array(n);
      this.ny = new Float32Array(n);
      this.adj = Array.from({ length: n }, () => []);
      data.nodes.forEach((p, i) => { this.nx[i] = p[0]; this.ny[i] = p[1]; });
      this.edges = data.edges.map((e, id) => {
        const pts = [[this.nx[e.a], this.ny[e.a]], ...e.p, [this.nx[e.b], this.ny[e.b]]];
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
          cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const edge = { id, a: e.a, b: e.b, pts, cum, len: cum[cum.length - 1], name: e.n || '', cls: e.c || 0, bbox: [x0, y0, x1, y1] };
        this.adj[e.a].push(edge);
        if (e.b !== e.a) this.adj[e.b].push(edge);
        return edge;
      });
      // spatial index of edges
      this.cell = 150;
      this.grid = new Map();
      for (const e of this.edges) {
        const [x0, y0, x1, y1] = e.bbox;
        for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx++)
          for (let gy = Math.floor(y0 / this.cell); gy <= Math.floor(y1 / this.cell); gy++) {
            const k = gx + ',' + gy;
            if (!this.grid.has(k)) this.grid.set(k, []);
            this.grid.get(k).push(e);
          }
      }
    }

    edgesIn(x0, y0, x1, y1) {
      const out = new Set();
      for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx++)
        for (let gy = Math.floor(y0 / this.cell); gy <= Math.floor(y1 / this.cell); gy++) {
          const l = this.grid.get(gx + ',' + gy);
          if (l) for (const e of l) out.add(e);
        }
      return out;
    }

    // point on edge at distance s from node a
    pointAt(e, s) {
      const { pts, cum } = e;
      s = Math.max(0, Math.min(e.len, s));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / seg;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }

    // unit heading when moving along e at s in direction dir (+1 toward b, -1 toward a)
    headingAt(e, s, dir) {
      const d = 6;
      const p = this.pointAt(e, s - d * dir * 0.5);
      const q = this.pointAt(e, s + d * dir * 0.5);
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    }

    // heading leaving node n along edge e (looks ~18 m in)
    outHeading(e, n) {
      const fromA = e.a === n;
      const s0 = fromA ? 0 : e.len;
      const look = Math.min(18, e.len);
      const p = this.pointAt(e, s0);
      const q = this.pointAt(e, fromA ? look : e.len - look);
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    }

    nearest(x, y, maxR = 400) {
      let best = null, bd = Infinity;
      for (let r = 50; r <= maxR && !best; r *= 2) {
        for (const e of this.edgesIn(x - r, y - r, x + r, y + r)) {
          const { pts, cum } = e;
          for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
            const dx = bx - ax, dy = by - ay;
            const L2 = dx * dx + dy * dy || 1;
            let t = ((x - ax) * dx + (y - ay) * dy) / L2;
            t = Math.max(0, Math.min(1, t));
            const px = ax + dx * t, py = ay + dy * t;
            const d = Math.hypot(x - px, y - py);
            if (d < bd) { bd = d; best = { e, s: cum[i - 1] + t * (cum[i] - cum[i - 1]), x: px, y: py, d }; }
          }
        }
      }
      return best;
    }

    other(e, n) { return e.a === n ? e.b : e.a; }

    // Dijkstra from a position; returns Float32Array of distances (to maxD)
    distancesFrom(pos, maxD = Infinity) {
      const n = this.nx.length;
      const dist = new Float64Array(n).fill(Infinity);
      const heap = new Heap();
      const push = (node, d) => { if (d < dist[node]) { dist[node] = d; heap.push(d, node); } };
      push(pos.e.a, pos.s);
      push(pos.e.b, pos.e.len - pos.s);
      while (heap.size) {
        const [d, u] = heap.pop();
        if (d > dist[u] || d > maxD) continue;
        for (const e of this.adj[u]) push(this.other(e, u), d + e.len);
      }
      return dist;
    }

    // A* between two positions; returns {dist, nodes:[...]} path of nodes to walk through (from start)
    path(from, to) {
      if (from.e === to.e) return { dist: Math.abs(from.s - to.s), nodes: [] };
      const n = this.nx.length;
      const g = new Map(), prev = new Map();
      const tx = this.pointAt(to.e, to.s);
      const h = (u) => Math.hypot(this.nx[u] - tx[0], this.ny[u] - tx[1]);
      const goal = new Map([[to.e.a, to.s], [to.e.b, to.e.len - to.s]]);
      const heap = new Heap();
      const start = [[from.e.a, from.s], [from.e.b, from.e.len - from.s]];
      for (const [u, d] of start) { if (!g.has(u) || d < g.get(u)) { g.set(u, d); prev.set(u, -1); heap.push(d + h(u), u); } }
      let bestEnd = -1, bestCost = Infinity;
      const closed = new Set();
      let iter = 0;
      while (heap.size && iter++ < 60000) {
        const [f, u] = heap.pop();
        if (closed.has(u)) continue;
        closed.add(u);
        const gu = g.get(u);
        if (f >= bestCost) break;
        if (goal.has(u)) {
          const c = gu + goal.get(u);
          if (c < bestCost) { bestCost = c; bestEnd = u; }
        }
        for (const e of this.adj[u]) {
          const v = this.other(e, u);
          const nd = gu + e.len;
          if (!g.has(v) || nd < g.get(v)) { g.set(v, nd); prev.set(v, u); heap.push(nd + h(v), v); }
        }
      }
      if (bestEnd < 0) return null;
      const nodes = [];
      for (let u = bestEnd; u !== -1; u = prev.get(u)) nodes.push(u);
      nodes.reverse();
      return { dist: bestCost, nodes };
    }

    edgeBetween(u, v) {
      let best = null;
      for (const e of this.adj[u]) if (this.other(e, u) === v && (!best || e.len < best.len)) best = e;
      return best;
    }
  }

  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(k, v) {
      const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
      while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
      K[i] = k; V[i] = v;
    }
    pop() {
      const K = this.k, V = this.v; const rk = K[0], rv = V[0];
      const lk = K.pop(), lv = V.pop();
      if (K.length) {
        let i = 0; const n = K.length;
        while (true) {
          let c = 2 * i + 1; if (c >= n) break;
          if (c + 1 < n && K[c + 1] < K[c]) c++;
          if (K[c] >= lk) break;
          K[i] = K[c]; V[i] = V[c]; i = c;
        }
        K[i] = lk; V[i] = lv;
      }
      return [rk, rv];
    }
  }

  PM.Graph = Graph;
})();
