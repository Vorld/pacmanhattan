import type { StreetGraph } from './graph';

/** A point on the graph: `s` meters from the a-end of `edge`. */
export interface GraphPoint {
  edge: number;
  s: number;
}

export interface Path {
  /** Nodes to visit in order; empty when both points share an edge. */
  nodes: number[];
  cost: number;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  peekKey() {
    return this.keys[0];
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(i: number, j: number) {
    [this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]];
    [this.keys[i], this.keys[j]] = [this.keys[j], this.keys[i]];
  }
}

/** Reusable A* over a StreetGraph between points that may sit mid-edge. */
export class PathFinder {
  private g: Float64Array;
  private prev: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private run = 0;

  constructor(private graph: StreetGraph) {
    this.g = new Float64Array(graph.nodeCount);
    this.prev = new Int32Array(graph.nodeCount);
    this.stamp = new Uint32Array(graph.nodeCount);
    this.closed = new Uint32Array(graph.nodeCount);
  }

  find(from: GraphPoint, to: GraphPoint): Path | null {
    const graph = this.graph;
    const fromEdge = graph.edges[from.edge];
    const toEdge = graph.edges[to.edge];
    if (from.edge === to.edge) return { nodes: [], cost: Math.abs(from.s - to.s) };

    this.run++;
    const run = this.run;
    const goal = graph.pointAt(to.edge, to.s);
    const h = (n: number) => Math.hypot(graph.nodeX[n] - goal.x, graph.nodeY[n] - goal.y);
    const heap = new MinHeap();
    const open = (n: number, cost: number, prev: number) => {
      if (this.stamp[n] === run && this.g[n] <= cost) return;
      this.stamp[n] = run;
      this.g[n] = cost;
      this.prev[n] = prev;
      heap.push(n, cost + h(n));
    };
    open(fromEdge.a, from.s, -1);
    open(fromEdge.b, fromEdge.length - from.s, -1);

    // Reaching either end of the target edge still leaves the walk along it.
    const goalExtra = new Map<number, number>([
      [toEdge.a, to.s],
      [toEdge.b, toEdge.length - to.s],
    ]);
    if (toEdge.a === toEdge.b) goalExtra.set(toEdge.a, Math.min(to.s, toEdge.length - to.s));

    let best = Infinity;
    let bestNode = -1;
    while (heap.size && heap.peekKey() < best) {
      const n = heap.pop();
      if (this.closed[n] === run) continue;
      this.closed[n] = run;
      const extra = goalExtra.get(n);
      if (extra !== undefined && this.g[n] + extra < best) {
        best = this.g[n] + extra;
        bestNode = n;
      }
      for (const exit of graph.exits[n]) {
        const next = graph.otherEnd(exit.edge, n);
        if (this.closed[next] !== run) open(next, this.g[n] + graph.edges[exit.edge].length, n);
      }
    }
    if (bestNode < 0) return null;

    const nodes: number[] = [];
    for (let n = bestNode; n !== -1; n = this.prev[n]) nodes.push(n);
    nodes.reverse();
    return { nodes, cost: best };
  }
}
