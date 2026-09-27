import { toXY, type Vec, normalize } from './geo';

/** Compact graph file produced by scripts/build-graph.mjs. */
export interface GraphData {
  city: string;
  nodes: number[]; // [lon, lat, lon, lat, ...]
  edges: [number, number, number, number[]][]; // [a, b, nameIndex, innerLonLat]
  names: string[];
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  name: string;
  xs: Float64Array;
  ys: Float64Array;
  cum: Float64Array; // cumulative length at each vertex
  length: number;
}

/** An exit from a node: follow `edge`, starting at its a-end when `forward`. */
export interface Exit {
  edge: number;
  forward: boolean;
}

const CELL = 100; // spatial index cell size, meters

export class StreetGraph {
  readonly nodeCount: number;
  readonly nodeX: Float64Array;
  readonly nodeY: Float64Array;
  readonly nodeLonLat: Float64Array;
  readonly edges: Edge[] = [];
  readonly exits: Exit[][];
  private grid = new Map<string, number[]>();

  constructor(data: GraphData) {
    this.nodeCount = data.nodes.length / 2;
    this.nodeX = new Float64Array(this.nodeCount);
    this.nodeY = new Float64Array(this.nodeCount);
    this.nodeLonLat = Float64Array.from(data.nodes);
    this.exits = Array.from({ length: this.nodeCount }, () => []);

    for (let n = 0; n < this.nodeCount; n++) {
      const p = toXY(data.nodes[n * 2], data.nodes[n * 2 + 1]);
      this.nodeX[n] = p.x;
      this.nodeY[n] = p.y;
      const key = this.cellKey(p.x, p.y);
      const cell = this.grid.get(key);
      if (cell) cell.push(n);
      else this.grid.set(key, [n]);
    }

    data.edges.forEach(([a, b, nameIdx, inner], id) => {
      const count = inner.length / 2 + 2;
      const xs = new Float64Array(count);
      const ys = new Float64Array(count);
      const cum = new Float64Array(count);
      xs[0] = this.nodeX[a];
      ys[0] = this.nodeY[a];
      for (let i = 0; i < inner.length / 2; i++) {
        const p = toXY(inner[i * 2], inner[i * 2 + 1]);
        xs[i + 1] = p.x;
        ys[i + 1] = p.y;
      }
      xs[count - 1] = this.nodeX[b];
      ys[count - 1] = this.nodeY[b];
      for (let i = 1; i < count; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
      this.edges.push({ id, a, b, name: data.names[nameIdx] ?? '', xs, ys, cum, length: cum[count - 1] });
      this.exits[a].push({ edge: id, forward: true });
      this.exits[b].push({ edge: id, forward: false });
    });
  }

  private cellKey(x: number, y: number) {
    return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  }

  nodePos(n: number): Vec {
    return { x: this.nodeX[n], y: this.nodeY[n] };
  }

  /** Point at distance `s` from the edge's a-end. */
  pointAt(edgeId: number, s: number): Vec {
    const e = this.edges[edgeId];
    if (s <= 0) return { x: e.xs[0], y: e.ys[0] };
    if (s >= e.length) return { x: e.xs[e.xs.length - 1], y: e.ys[e.ys.length - 1] };
    let lo = 0;
    let hi = e.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (e.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const seg = e.cum[hi] - e.cum[lo] || 1;
    const t = (s - e.cum[lo]) / seg;
    return { x: e.xs[lo] + t * (e.xs[hi] - e.xs[lo]), y: e.ys[lo] + t * (e.ys[hi] - e.ys[lo]) };
  }

  /**
   * Direction of travel along an edge around distance `s` when moving with
   * `dir` (+1 toward b). Uses a short look-ahead so tiny kinks don't jitter.
   */
  directionAt(edgeId: number, s: number, dir: 1 | -1, look = 15): Vec {
    const e = this.edges[edgeId];
    const from = this.pointAt(edgeId, Math.max(0, Math.min(e.length, s - dir * 2)));
    const to = this.pointAt(edgeId, Math.max(0, Math.min(e.length, s + dir * look)));
    return normalize({ x: to.x - from.x, y: to.y - from.y });
  }

  /** Heading when leaving a node through `exit`, averaged over the first `look` meters. */
  exitDirection(exit: Exit, look = 20): Vec {
    const e = this.edges[exit.edge];
    const l = Math.min(look, e.length);
    const start = exit.forward ? this.pointAt(exit.edge, 0) : this.pointAt(exit.edge, e.length);
    const end = exit.forward ? this.pointAt(exit.edge, l) : this.pointAt(exit.edge, e.length - l);
    return normalize({ x: end.x - start.x, y: end.y - start.y });
  }

  /** Heading on arrival at the end of an edge travelled with `dir`. */
  arrivalDirection(edgeId: number, dir: 1 | -1, look = 20): Vec {
    const e = this.edges[edgeId];
    const l = Math.min(look, e.length);
    const end = dir > 0 ? this.pointAt(edgeId, e.length) : this.pointAt(edgeId, 0);
    const start = dir > 0 ? this.pointAt(edgeId, e.length - l) : this.pointAt(edgeId, l);
    return normalize({ x: end.x - start.x, y: end.y - start.y });
  }

  /**
   * Edges on dead-end branches: once you enter one, the only way out is back
   * the way you came. Found by repeatedly peeling off degree-1 nodes.
   */
  deadEndEdges(): Uint8Array {
    const dead = new Uint8Array(this.edges.length);
    const degree = Int32Array.from(this.exits, (x) => x.length);
    const queue: number[] = [];
    for (let n = 0; n < this.nodeCount; n++) if (degree[n] === 1) queue.push(n);
    while (queue.length) {
      const n = queue.pop()!;
      const exit = this.exits[n].find((x) => !dead[x.edge]);
      if (!exit) continue;
      dead[exit.edge] = 1;
      degree[n]--;
      const other = this.otherEnd(exit.edge, n);
      if (--degree[other] === 1) queue.push(other);
    }
    return dead;
  }

  otherEnd(edgeId: number, node: number): number {
    const e = this.edges[edgeId];
    return e.a === node ? e.b : e.a;
  }

  /** Nodes within `r` meters of (x, y). */
  nodesWithin(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    const r2 = r * r;
    const c0x = Math.floor((x - r) / CELL);
    const c1x = Math.floor((x + r) / CELL);
    const c0y = Math.floor((y - r) / CELL);
    const c1y = Math.floor((y + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        for (const n of this.grid.get(`${cx},${cy}`) ?? []) {
          const dx = this.nodeX[n] - x;
          const dy = this.nodeY[n] - y;
          if (dx * dx + dy * dy <= r2) out.push(n);
        }
      }
    }
    return out;
  }

  nearestNode(x: number, y: number): number {
    for (let r = CELL; r < 50_000; r *= 2) {
      const near = this.nodesWithin(x, y, r);
      if (near.length) {
        let best = near[0];
        let bestD = Infinity;
        for (const n of near) {
          const d = Math.hypot(this.nodeX[n] - x, this.nodeY[n] - y);
          if (d < bestD) [best, bestD] = [n, d];
        }
        return best;
      }
    }
    return 0;
  }
}
