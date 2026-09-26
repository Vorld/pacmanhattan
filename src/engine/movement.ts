import { angleBetween, type Vec } from './geo';
import type { Exit, StreetGraph } from './graph';

/**
 * Something moving along the street graph. Positions are always
 * (edge, distance along edge), so movers can never leave the streets.
 */
export interface Mover {
  edge: number;
  s: number; // meters from the edge's a-end
  dir: 1 | -1; // +1 moves toward b
  moving: boolean;
}

export const TURN_TOLERANCE_DEG = 50; // how far a street may be from the pressed direction
export const STRAIGHT_TOLERANCE_DEG = 40; // how much a street may bend and still count as "straight on"
const REVERSE_THRESHOLD_DEG = 135;

export function positionOf(g: StreetGraph, m: Mover): Vec {
  return g.pointAt(m.edge, m.s);
}

export function headingOf(g: StreetGraph, m: Mover): Vec {
  return g.directionAt(m.edge, m.s, m.dir);
}

/** The node the mover is travelling toward (or standing on, when stopped at an end). */
export function nodeAhead(g: StreetGraph, m: Mover): number {
  const e = g.edges[m.edge];
  return m.dir > 0 ? e.b : e.a;
}

export function moverAtExit(exit: Exit, g: StreetGraph): Mover {
  return { edge: exit.edge, s: exit.forward ? 0 : g.edges[exit.edge].length, dir: exit.forward ? 1 : -1, moving: true };
}

function isAtEnd(g: StreetGraph, m: Mover) {
  const e = g.edges[m.edge];
  return m.dir > 0 ? m.s >= e.length : m.s <= 0;
}

/** Exit from `node` whose direction best matches `want`, within `tolerance` degrees. */
export function bestExit(
  g: StreetGraph,
  node: number,
  want: Vec,
  tolerance: number,
  exclude?: (x: Exit) => boolean,
): Exit | null {
  let best: Exit | null = null;
  let bestAngle = tolerance;
  for (const exit of g.exits[node]) {
    if (exclude?.(exit)) continue;
    const angle = angleBetween(want, g.exitDirection(exit));
    if (angle <= bestAngle) [best, bestAngle] = [exit, angle];
  }
  return best;
}

export interface GhostStepResult {
  /** Nodes passed through or stopped on during this step. */
  nodes: number[];
  /** True when the queued turn was used and should be cleared. */
  intentUsed: boolean;
}

/**
 * Advance the player's ghost by `distance` meters, arcade-style: it keeps
 * moving, takes the queued turn (`intent`) at the next intersection that
 * allows it, otherwise goes straight on, and stops when blocked.
 */
export function stepGhost(g: StreetGraph, m: Mover, intent: Vec | null, distance: number): GhostStepResult {
  const nodes: number[] = [];
  let intentUsed = false;
  let remaining = distance;

  // Reverse immediately, even mid-block.
  if (intent && m.moving && angleBetween(intent, headingOf(g, m)) >= REVERSE_THRESHOLD_DEG) {
    m.dir = m.dir > 0 ? -1 : 1;
    intentUsed = true;
    intent = null;
  }

  for (let guard = 0; remaining > 1e-9 && guard < 64; guard++) {
    if (!m.moving) {
      // Standing on a node: only a pressed direction gets us going again.
      if (!intent) break;
      const node = nodeAhead(g, m);
      const exit = bestExit(g, node, intent, TURN_TOLERANCE_DEG + 20);
      if (!exit) break;
      Object.assign(m, moverAtExit(exit, g));
      intentUsed = true;
      intent = null;
      continue;
    }

    const e = g.edges[m.edge];
    const toEnd = m.dir > 0 ? e.length - m.s : m.s;
    if (remaining < toEnd) {
      m.s += m.dir * remaining;
      break;
    }
    remaining -= toEnd;
    m.s = m.dir > 0 ? e.length : 0;
    const node = nodeAhead(g, m);
    nodes.push(node);

    const arrival = g.arrivalDirection(m.edge, m.dir);
    const cameFrom = m.edge;
    const arrivedForward = m.dir > 0;
    const isBacktrack = (x: Exit) => x.edge === cameFrom && x.forward !== arrivedForward;

    let exit: Exit | null = null;
    if (intent) {
      exit = bestExit(g, node, intent, TURN_TOLERANCE_DEG, isBacktrack);
      if (exit) {
        intentUsed = true;
        intent = null;
      }
    }
    exit ??= bestExit(g, node, arrival, STRAIGHT_TOLERANCE_DEG, isBacktrack);
    // A pass-through node (one way in, one way out) never blocks, however sharp the bend.
    if (!exit) {
      const onward = g.exits[node].filter((x) => !isBacktrack(x));
      if (onward.length === 1 && g.exits[node].length === 2) exit = onward[0];
    }
    if (!exit) {
      m.moving = false;
      break;
    }
    Object.assign(m, moverAtExit(exit, g));
  }
  return { nodes, intentUsed };
}

/**
 * Move a chaser `distance` meters along a node path. `path` lists the nodes
 * still to reach; when it is used up the chaser heads for `goal` on its edge.
 * Returns the nodes passed through.
 */
export function stepAlongPath(
  g: StreetGraph,
  m: Mover,
  path: number[],
  goal: { edge: number; s: number },
  distance: number,
): number[] {
  const passed: number[] = [];
  let remaining = distance;
  m.moving = true;
  for (let guard = 0; remaining > 1e-9 && guard < 64; guard++) {
    if (path.length === 0 && m.edge === goal.edge) {
      const delta = goal.s - m.s;
      if (Math.abs(delta) <= remaining) {
        m.s = goal.s;
        break;
      }
      m.dir = delta > 0 ? 1 : -1;
      m.s += m.dir * remaining;
      break;
    }
    const e = g.edges[m.edge];
    // Face whichever end of this edge is the next node on the path.
    if (path.length && !isAtEnd(g, m)) {
      if (path[0] === e.b && path[0] !== e.a) m.dir = 1;
      else if (path[0] === e.a && path[0] !== e.b) m.dir = -1;
    }
    const toEnd = m.dir > 0 ? e.length - m.s : m.s;
    if (remaining < toEnd) {
      m.s += m.dir * remaining;
      break;
    }
    remaining -= toEnd;
    m.s = m.dir > 0 ? e.length : 0;
    const node = nodeAhead(g, m);
    passed.push(node);
    if (path[0] === node) path.shift();

    // Choose the edge toward the next path node, or onto the goal edge.
    const nextNode = path[0];
    let exit: Exit | undefined;
    if (nextNode !== undefined) {
      exit = g.exits[node]
        .filter((x) => g.otherEnd(x.edge, node) === nextNode)
        .sort((x, y) => g.edges[x.edge].length - g.edges[y.edge].length)[0];
    } else {
      exit = g.exits[node].find((x) => x.edge === goal.edge);
    }
    if (!exit) {
      // Path is stale; wait for the next repath.
      m.moving = false;
      break;
    }
    Object.assign(m, moverAtExit(exit, g));
  }
  return passed;
}
