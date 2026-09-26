import { describe, expect, it } from 'vitest';
import { stepGhost, nodeAhead, positionOf, type Mover } from '../src/engine/movement';
import { tinyGraph } from './helpers';

// A plus-shaped crossing plus a T-junction to the north:
//
//          5 ---- 4 ---- 6        (T: 3 continues north to 4, which only goes east/west)
//                 |
//          1 ---- 0 ---- 2
//                 |
//                 3'
const g = tinyGraph(
  [
    [0, 0], // 0 center
    [-100, 0], // 1 west
    [100, 0], // 2 east
    [0, -100], // 3 south
    [0, 100], // 4 north (T junction)
    [-100, 100], // 5
    [100, 100], // 6
  ],
  [
    [3, 0], // e0 south -> center
    [0, 1], // e1
    [0, 2], // e2
    [0, 4], // e3
    [4, 5], // e4
    [4, 6], // e5
  ],
);
const N = { x: 0, y: 1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
const S = { x: 0, y: -1 };

const northbound = (): Mover => ({ edge: 0, s: 50, dir: 1, moving: true });

describe('ghost movement', () => {
  it('goes straight through a crossing with no turn queued', () => {
    const m = northbound();
    stepGhost(g, m, null, 100); // 50 to center, 50 up e3
    expect(m.edge).toBe(3);
    expect(positionOf(g, m).y).toBeCloseTo(50, 0);
  });

  it('takes a queued turn at the next crossing', () => {
    const m = northbound();
    const r = stepGhost(g, m, E, 80);
    expect(r.intentUsed).toBe(true);
    expect(m.edge).toBe(2);
    expect(positionOf(g, m).x).toBeCloseTo(30, 0);
  });

  it('keeps a turn queued until a crossing allows it', () => {
    const m: Mover = { edge: 3, s: 20, dir: 1, moving: true };
    const r = stepGhost(g, m, S, 0); // pressing the way we came reverses immediately
    expect(r.intentUsed).toBe(true);
    expect(m.dir).toBe(-1);
  });

  it('stops at a T-junction when nothing is queued, then resumes on input', () => {
    const m: Mover = { edge: 3, s: 20, dir: 1, moving: true };
    stepGhost(g, m, null, 500);
    expect(m.moving).toBe(false);
    expect(nodeAhead(g, m)).toBe(4);
    stepGhost(g, m, W, 30);
    expect(m.moving).toBe(true);
    expect(m.edge).toBe(4);
    expect(positionOf(g, m).x).toBeCloseTo(-30, 0);
  });

  it('never leaves the edge bounds', () => {
    const m = northbound();
    const dirs = [N, E, S, W, null];
    for (let i = 0; i < 2000; i++) {
      stepGhost(g, m, dirs[i % 5], 7.3);
      const len = g.edges[m.edge].length;
      expect(m.s).toBeGreaterThanOrEqual(0);
      expect(m.s).toBeLessThanOrEqual(len + 1e-9);
    }
  });
});
