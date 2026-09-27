import type { GameConfig } from './config';
import { dist, type Vec } from './geo';
import type { StreetGraph } from './graph';
import { hintForVisit, type Hint } from './hints';
import { positionOf, stepAlongPath, stepGhost, type Mover } from './movement';
import { PathFinder, type GraphPoint } from './pathfinding';
import type { Landmark, PlacesData, Target } from './places';
import { computeScore, targetBonus, type ScoreBreakdown } from './scoring';

/** A run only ends when Pac-Man catches the ghost (or the player quits). */
export type RunStatus = 'playing' | 'caught' | 'quit';

export interface FoundTarget {
  target: Target;
  bonus: number;
  hintsUsed: number;
  time: number;
}

/** One Pac-Man. The first spawns at the start; more join as targets are found. */
export interface Pacman {
  mover: Mover;
  /** Nodes still to visit on the current route, and where that route ends. */
  path: number[];
  goal: GraphPoint;
  repathIn: number;
  /** Walking distance to the ghost, meters (Infinity before the first route). */
  distance: number;
  /** Run time at which this Pac-Man starts moving. */
  activeAt: number;
  /** Positions sampled alongside the ghost's route; `routeStart` is the ghost-route index of the first. */
  route: Vec[];
  routeStart: number;
}

export type RunEvent =
  | { type: 'landmark'; landmark: Landmark; hint: Hint }
  | { type: 'caught' }
  | { type: 'found'; found: FoundTarget; next: Target }
  | { type: 'pacman'; pacman: Pacman; count: number };

export interface RunOptions {
  rng?: () => number;
  targetId?: string;
  /** Force the ghost's starting node (tests). */
  ghostNode?: number;
  /** Force Pac-Man's starting node (tests). */
  pacmanNode?: number;
}

const ROUTE_SAMPLE_S = 0.25;
const EXTRA_PACMAN_WAKE_S = 1.5; // a new Pac-Man pauses briefly so the player sees it arrive
const DISCOVERY_STEP_M = 25;

/** One play-through. Pure game logic: no DOM, driven by `update(dt)`. */
export class Run {
  status: RunStatus = 'playing';
  time = 0;
  /** The target currently being hunted; changes each time one is found. */
  target: Target;
  readonly found: FoundTarget[] = [];
  readonly ghost: Mover;
  readonly pacmen: Pacman[] = [];
  readonly visited: Landmark[] = [];
  /** Hints earned for the current target (reset when it changes). */
  hints: Hint[] = [];
  landmarkPoints = 0;
  readonly route: Vec[] = [];
  readonly discovered = new Set<number>();
  /** Edges discovered since the renderer last drained this list. */
  newlyDiscovered: number[] = [];

  private intent: Vec | null = null;
  private history: { t: number; p: GraphPoint }[] = [];
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
    const { spawnMinDistance, spawnMaxDistance, startGraceMs } = config.pacman;
    this.addPacman(opts.pacmanNode ?? this.pickPacmanSpawn(spawnMinDistance, spawnMaxDistance), startGraceMs / 1000);
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
  pacmanPos(p: Pacman) {
    return positionOf(this.graph, p.mover);
  }
  isActive(p: Pacman) {
    return this.time >= p.activeAt;
  }
  /** Walking distance to the nearest active Pac-Man (drives the warnings). */
  get pacmanDistance() {
    return Math.min(...this.pacmen.filter((p) => this.isActive(p)).map((p) => p.distance));
  }
  get pacmanSpeed() {
    const p = this.config.pacman;
    const minutes = Math.max(0, this.time - p.startGraceMs / 1000) / 60;
    return Math.min(p.maxSpeed, p.baseSpeed + p.speedGainPerMinute * minutes);
  }
  get score(): ScoreBreakdown {
    const targetPoints = this.found.reduce((sum, f) => sum + f.bonus, 0);
    return computeScore(this.config.scoring, this.landmarkPoints, this.time, targetPoints);
  }

  /** Player gave up. */
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

    const ghost = this.ghostPos;
    for (const p of this.pacmen) {
      if (this.isActive(p)) this.updatePacman(p, dt);
      if (this.status === 'playing' && dist(this.pacmanPos(p), ghost) <= this.config.catchRadius) {
        this.status = 'caught';
        this.emit({ type: 'caught' });
      }
    }

    this.sampleIn -= dt;
    if (this.sampleIn <= 0) {
      this.sampleIn = ROUTE_SAMPLE_S;
      this.recordRoute();
    }
  }

  private updatePacman(p: Pacman, dt: number) {
    p.repathIn -= dt;
    if (p.repathIn <= 0) {
      p.repathIn = this.config.pacman.repathIntervalMs / 1000;
      const at = { edge: p.mover.edge, s: p.mover.s };
      const delayed = this.delayedGhostPoint();
      const path = this.finder.find(at, delayed);
      if (path) {
        p.path = path.nodes;
        p.goal = delayed;
      }
      p.distance = this.finder.find(at, this.ghostPoint())?.cost ?? Infinity;
    }
    stepAlongPath(this.graph, p.mover, p.path, p.goal, this.pacmanSpeed * dt);
  }

  private addPacman(node: number, activeAt: number) {
    const mover = this.standingAt(node);
    const at = { edge: mover.edge, s: mover.s };
    const pacman: Pacman = {
      mover,
      path: [],
      goal: this.ghostPoint(),
      repathIn: 0,
      distance: this.finder.find(at, this.ghostPoint())?.cost ?? Infinity,
      activeAt,
      route: [],
      routeStart: this.route.length,
    };
    this.pacmen.push(pacman);
    return pacman;
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
      const { difficulty } = this.target;
      const found: FoundTarget = {
        target: this.target,
        bonus: targetBonus(this.config.scoring, this.hints.length, difficulty),
        hintsUsed: this.hints.length,
        time: this.time,
      };
      this.found.push(found);
      this.target = this.pickNextTarget();
      this.hints = [];
      this.emit({ type: 'found', found, next: this.target });

      const every = this.config.pacman.extraEveryTargets;
      if (every > 0 && this.found.length % every === 0) {
        const { extraSpawnMinDistance: lo, extraSpawnMaxDistance: hi } = this.config.pacman;
        const pacman = this.addPacman(this.pickPacmanSpawn(lo, hi), this.time + EXTRA_PACMAN_WAKE_S);
        pacman.route.push(this.pacmanPos(pacman));
        this.emit({ type: 'pacman', pacman, count: this.pacmen.length });
      }
    }
  }

  /** A target not yet found this run, preferably at the usual spawn distance from the ghost. */
  private pickNextTarget(): Target {
    const ghost = this.ghostPos;
    const { targetSpawnMinDistance: lo, targetSpawnMaxDistance: hi } = this.config;
    const done = new Set(this.found.map((f) => f.target));
    let pool = this.places.targets.filter((t) => !done.has(t));
    if (!pool.length) pool = this.places.targets.filter((t) => t !== this.target); // found them all: go again
    const away = (t: Target) => dist(ghost, this.graph.nodePos(t.node));
    const inRange = pool.filter((t) => away(t) >= lo && away(t) <= hi);
    if (inRange.length) return this.pick(inRange)!;
    // Otherwise the one closest to the preferred range (but never right here).
    const far = pool.filter((t) => away(t) > this.config.arrivalRadius * 4);
    const miss = (t: Target) => (away(t) < lo ? lo - away(t) : away(t) - hi);
    return (far.length ? far : pool).sort((a, b) => miss(a) - miss(b))[0];
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
    for (const p of this.pacmen) p.route.push(this.pacmanPos(p));
  }

  private ghostPoint(): GraphPoint {
    return { edge: this.ghost.edge, s: this.ghost.s };
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

  /**
   * A node whose walking distance to the ghost is between `lo` and `hi`
   * (straight-line at least `lo` too), so no Pac-Man appears on top of you.
   */
  private pickPacmanSpawn(lo: number, hi: number): number {
    const g = this.graph;
    const ghost = this.ghostPos;
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
