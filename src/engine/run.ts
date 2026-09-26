import type { GameConfig } from './config';
import { dist, type Vec } from './geo';
import type { StreetGraph } from './graph';
import { hintForVisit, type Hint } from './hints';
import { positionOf, stepAlongPath, stepGhost, type Mover } from './movement';
import { PathFinder, type GraphPoint } from './pathfinding';
import type { Landmark, PlacesData, Target } from './places';
import { computeScore, type ScoreBreakdown } from './scoring';

export type RunStatus = 'playing' | 'caught' | 'found' | 'quit';

export type RunEvent =
  | { type: 'landmark'; landmark: Landmark; hint: Hint }
  | { type: 'caught' }
  | { type: 'found' };

export interface RunOptions {
  rng?: () => number;
  targetId?: string;
  /** Force the ghost's starting node (tests). */
  ghostNode?: number;
  /** Force Pac-Man's starting node (tests). */
  pacmanNode?: number;
}

const ROUTE_SAMPLE_S = 0.25;
const DISCOVERY_STEP_M = 25;

/** One play-through. Pure game logic: no DOM, driven by `update(dt)`. */
export class Run {
  status: RunStatus = 'playing';
  time = 0;
  readonly target: Target;
  readonly ghost: Mover;
  readonly pacman: Mover;
  readonly visited: Landmark[] = [];
  readonly hints: Hint[] = [];
  landmarkPoints = 0;
  /** Path distance from Pac-Man to the ghost, meters (Infinity before the first route). */
  pacmanDistance = Infinity;
  readonly route: Vec[] = [];
  readonly pacmanRoute: Vec[] = [];
  readonly discovered = new Set<number>();
  /** Edges discovered since the renderer last drained this list. */
  newlyDiscovered: number[] = [];

  private intent: Vec | null = null;
  private history: { t: number; p: GraphPoint }[] = [];
  private pacPath: number[] = [];
  private pacGoal: GraphPoint;
  private repathIn = 0;
  private sampleIn = 0;
  private lastDiscoveryPos: Vec | null = null;
  private finder: PathFinder;
  private listeners: ((e: RunEvent) => void)[] = [];
  private rng: () => number;

  constructor(
    readonly graph: StreetGraph,
    readonly places: PlacesData,
    readonly config: GameConfig,
    opts: RunOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.finder = new PathFinder(graph);
    const { targets } = places;
    this.target = targets.find((t) => t.id === opts.targetId) ?? targets[Math.floor(this.rng() * targets.length)];

    const ghostNode = opts.ghostNode ?? this.pickGhostSpawn();
    this.ghost = this.standingAt(ghostNode);
    const pacNode = opts.pacmanNode ?? this.pickPacmanSpawn();
    this.pacman = this.standingAt(pacNode);
    this.pacGoal = this.ghostPoint();
    this.recordRoute();
    this.discover(true);
  }

  on(fn: (e: RunEvent) => void) {
    this.listeners.push(fn);
  }

  /** Queue a turn in world space; applied at the next intersection that allows it. */
  queueTurn(dir: Vec) {
    this.intent = dir;
  }

  get ghostPos() {
    return positionOf(this.graph, this.ghost);
  }
  get pacmanPos() {
    return positionOf(this.graph, this.pacman);
  }
  get pacmanSpeed() {
    const p = this.config.pacman;
    const minutes = Math.max(0, this.time - p.startGraceMs / 1000) / 60;
    return Math.min(p.maxSpeed, p.baseSpeed + p.speedGainPerMinute * minutes);
  }
  get pacmanActive() {
    return this.time * 1000 >= this.config.pacman.startGraceMs;
  }
  get score(): ScoreBreakdown {
    return computeScore(
      this.config.scoring,
      this.landmarkPoints,
      this.time,
      this.status === 'found',
      this.hints.length,
      this.target.difficulty,
    );
  }

  /** Player gave up; no target bonus. */
  quit() {
    if (this.status === 'playing') this.status = 'quit';
  }

  update(dt: number) {
    if (this.status !== 'playing') return;
    this.time += dt;

    const step = stepGhost(this.graph, this.ghost, this.intent, this.config.ghostSpeed * dt);
    if (step.intentUsed) this.intent = null;
    this.history.push({ t: this.time, p: this.ghostPoint() });
    const keepAfter = this.time - this.config.pacman.reactionDelayMs / 1000 - 1;
    while (this.history.length > 2 && this.history[1].t < keepAfter) this.history.shift();

    this.discover(false);
    this.checkArrivals(step.nodes);
    if (this.status !== 'playing') return;

    if (this.pacmanActive) this.updatePacman(dt);
    if (dist(this.pacmanPos, this.ghostPos) <= this.config.catchRadius) {
      this.status = 'caught';
      this.emit({ type: 'caught' });
    }

    this.sampleIn -= dt;
    if (this.sampleIn <= 0) {
      this.sampleIn = ROUTE_SAMPLE_S;
      this.recordRoute();
    }
  }

  private updatePacman(dt: number) {
    this.repathIn -= dt;
    if (this.repathIn <= 0) {
      this.repathIn = this.config.pacman.repathIntervalMs / 1000;
      const delayed = this.delayedGhostPoint();
      const path = this.finder.find(this.pacmanPoint(), delayed);
      if (path) {
        this.pacPath = path.nodes;
        this.pacGoal = delayed;
      }
      this.pacmanDistance = this.finder.find(this.pacmanPoint(), this.ghostPoint())?.cost ?? Infinity;
    }
    stepAlongPath(this.graph, this.pacman, this.pacPath, this.pacGoal, this.pacmanSpeed * dt);
  }

  private checkArrivals(passedNodes: number[]) {
    const pos = this.ghostPos;
    const radius = this.config.arrivalRadius;
    const reached = (node: number) =>
      passedNodes.includes(node) || dist(pos, this.graph.nodePos(node)) <= radius;

    for (const lm of this.places.landmarks) {
      if (this.visited.includes(lm) || !reached(lm.node)) continue;
      this.visited.push(lm);
      this.landmarkPoints += lm.points;
      const hint = hintForVisit(this.hints.length, this.graph, this.target, lm);
      this.hints.push(hint);
      this.emit({ type: 'landmark', landmark: lm, hint });
    }
    if (reached(this.target.node)) {
      this.status = 'found';
      this.recordRoute();
      this.emit({ type: 'found' });
    }
  }

  private discover(force: boolean) {
    const pos = this.ghostPos;
    if (!force && this.lastDiscoveryPos && dist(pos, this.lastDiscoveryPos) < DISCOVERY_STEP_M) return;
    this.lastDiscoveryPos = pos;
    for (const n of this.graph.nodesWithin(pos.x, pos.y, this.config.discoveryRadius)) {
      for (const exit of this.graph.exits[n]) {
        if (!this.discovered.has(exit.edge)) {
          this.discovered.add(exit.edge);
          this.newlyDiscovered.push(exit.edge);
        }
      }
    }
  }

  private recordRoute() {
    this.route.push(this.ghostPos);
    this.pacmanRoute.push(this.pacmanPos);
  }

  private ghostPoint(): GraphPoint {
    return { edge: this.ghost.edge, s: this.ghost.s };
  }
  private pacmanPoint(): GraphPoint {
    return { edge: this.pacman.edge, s: this.pacman.s };
  }
  private delayedGhostPoint(): GraphPoint {
    const cutoff = this.time - this.config.pacman.reactionDelayMs / 1000;
    let p = this.history[0]?.p ?? this.ghostPoint();
    for (const h of this.history) {
      if (h.t > cutoff) break;
      p = h.p;
    }
    return p;
  }

  private emit(e: RunEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /** A stopped mover standing on `node`. */
  private standingAt(node: number): Mover {
    const exit = this.graph.exits[node][0];
    const len = this.graph.edges[exit.edge].length;
    // Standing at the node end of the edge, facing it, not moving.
    return exit.forward
      ? { edge: exit.edge, s: 0, dir: -1, moving: false }
      : { edge: exit.edge, s: len, dir: 1, moving: false };
  }

  private pick<T>(items: T[]): T | undefined {
    return items[Math.floor(this.rng() * items.length)];
  }

  private pickGhostSpawn(): number {
    const g = this.graph;
    const t = g.nodePos(this.target.node);
    const { targetSpawnMinDistance: lo, targetSpawnMaxDistance: hi } = this.config;
    const landmarkNodes = this.places.landmarks.map((l) => g.nodePos(l.node));
    const candidates: number[] = [];
    for (let n = 0; n < g.nodeCount; n++) {
      if (g.exits[n].length < 3) continue; // spawn on a real intersection
      const p = g.nodePos(n);
      const d = dist(p, t);
      if (d < lo || d > hi) continue;
      if (landmarkNodes.some((l) => dist(l, p) < this.config.arrivalRadius * 3)) continue;
      candidates.push(n);
    }
    return this.pick(candidates) ?? g.nearestNode(t.x + lo, t.y);
  }

  private pickPacmanSpawn(): number {
    const g = this.graph;
    const ghost = this.ghostPos;
    const { spawnMinDistance: lo, spawnMaxDistance: hi } = this.config.pacman;
    const ring = g.nodesWithin(ghost.x, ghost.y, hi).filter((n) => dist(g.nodePos(n), ghost) >= lo);
    // Straight-line distance underestimates walking distance; confirm with a real route.
    let fallback = -1;
    for (let tries = 0; tries < 30 && ring.length; tries++) {
      const n = ring.splice(Math.floor(this.rng() * ring.length), 1)[0];
      const exit = g.exits[n][0];
      const from = { edge: exit.edge, s: exit.forward ? 0 : g.edges[exit.edge].length };
      const path = this.finder.find(from, this.ghostPoint());
      if (!path || path.cost < lo) continue;
      if (path.cost <= hi * 1.5) return n;
      if (fallback < 0) fallback = n;
    }
    if (fallback >= 0) return fallback;
    return g.nearestNode(ghost.x + hi, ghost.y);
  }
}
