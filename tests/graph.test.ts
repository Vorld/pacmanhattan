import { describe, expect, it } from 'vitest';
import { PathFinder } from '../src/engine/pathfinding';
import { loadManhattan } from './helpers';

const { graph, places } = loadManhattan();

describe('Manhattan street graph', () => {
  it('is a single connected component (nobody can get stranded)', () => {
    const seen = new Uint8Array(graph.nodeCount);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
      const n = stack.pop()!;
      for (const x of graph.exits[n]) {
        const o = graph.otherEnd(x.edge, n);
        if (!seen[o]) {
          seen[o] = 1;
          count++;
          stack.push(o);
        }
      }
    }
    expect(count).toBe(graph.nodeCount);
  });

  it('has sane geometry', () => {
    for (const e of graph.edges) {
      expect(Number.isFinite(e.length)).toBe(true);
      expect(e.length).toBeGreaterThan(0);
    }
  });

  it('places every landmark and target on a graph node', () => {
    expect(places.landmarks.length).toBeGreaterThanOrEqual(30);
    expect(places.landmarks.length).toBeLessThanOrEqual(50);
    for (const p of [...places.landmarks, ...places.targets]) {
      expect(p.node).toBeGreaterThanOrEqual(0);
      expect(p.node).toBeLessThan(graph.nodeCount);
      expect(graph.exits[p.node].length).toBeGreaterThan(0);
    }
  });

  it('routes between every pair of targets and a hub landmark', () => {
    const finder = new PathFinder(graph);
    const hub = places.landmarks.find((l) => l.id === 'times-square')!;
    const at = (node: number) => {
      const x = graph.exits[node][0];
      return { edge: x.edge, s: x.forward ? 0 : graph.edges[x.edge].length };
    };
    for (const t of places.targets) {
      const path = finder.find(at(hub.node), at(t.node));
      expect(path, t.id).not.toBeNull();
      const a = graph.nodePos(hub.node);
      const b = graph.nodePos(t.node);
      expect(path!.cost).toBeGreaterThanOrEqual(Math.hypot(a.x - b.x, a.y - b.y) - 1);
    }
  });
});
