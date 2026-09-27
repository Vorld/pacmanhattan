import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig } from '../src/engine/config';
import { SCREEN_DIRS, dist } from '../src/engine/geo';
import { Run } from '../src/engine/run';
import { loadManhattan, seeded } from './helpers';

const { graph, places } = loadManhattan();
const DT = 1 / 60;

describe('run', () => {
  it('spawns the ghost far from the target and Pac-Man a safe distance away', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = new Run(graph, places, DEFAULT_CONFIG, { rng: seeded(seed) });
      const d = dist(run.ghostPos, graph.nodePos(run.target.node));
      expect(d).toBeGreaterThanOrEqual(DEFAULT_CONFIG.targetSpawnMinDistance);
      expect(dist(run.ghostPos, run.pacmanPos(run.pacmen[0]))).toBeGreaterThan(DEFAULT_CONFIG.catchRadius * 10);
      run.update(DEFAULT_CONFIG.pacman.startGraceMs / 1000 + 0.01); // first Pac-Man route
      expect(run.pacmanDistance).toBeGreaterThanOrEqual(DEFAULT_CONFIG.pacman.spawnMinDistance - 50);
      expect(run.pacmanDistance).toBeLessThanOrEqual(DEFAULT_CONFIG.pacman.spawnMaxDistance * 1.5 + 50);
    }
  });

  it('catches a ghost that stands still', () => {
    const run = new Run(graph, places, DEFAULT_CONFIG, { rng: seeded(7) });
    let caught = false;
    run.on((e) => (caught ||= e.type === 'caught'));
    for (let i = 0; i < 60 * 180 && run.status === 'playing'; i++) run.update(DT);
    expect(caught).toBe(true);
    expect(run.status).toBe('caught');
    expect(run.score.target).toBe(0);
  });

  it('gives the ghost a head start: not caught during the grace period', () => {
    const run = new Run(graph, places, DEFAULT_CONFIG, { rng: seeded(3) });
    for (let i = 0; i < 60 * (DEFAULT_CONFIG.pacman.startGraceMs / 1000); i++) run.update(DT);
    expect(run.status).toBe('playing');
  });

  it('awards points and a hint for each landmark, then moves on to a new target when one is found', () => {
    const ts = places.landmarks.find((l) => l.id === 'times-square')!;
    const cfg = mergeConfig({ pacman: { startGraceMs: 10_000_000 } });
    const run = new Run(graph, places, cfg, { targetId: 'nypl', ghostNode: ts.node });
    const events: string[] = [];
    run.on((e) => events.push(e.type));
    run.update(DT);
    expect(run.visited.map((l) => l.id)).toEqual(['times-square']);
    expect(run.hints[0].text).toMatch(/Midtown/);
    expect(events).toEqual(['landmark']);

    // Teleport onto the library's node.
    const exit = graph.exits[run.target.node][0];
    Object.assign(run.ghost, { edge: exit.edge, s: exit.forward ? 0 : graph.edges[exit.edge].length });
    run.update(DT);

    expect(events).toEqual(['landmark', 'found']);
    expect(run.status).toBe('playing');
    expect(run.found.map((f) => f.target.id)).toEqual(['nypl']);
    expect(run.found[0].hintsUsed).toBe(1);
    expect(run.score.target).toBe(DEFAULT_CONFIG.scoring.targetBaseBonus - DEFAULT_CONFIG.scoring.hintPenalty);

    // The next target is a different place at a sensible distance, with fresh hints.
    expect(run.target.id).not.toBe('nypl');
    expect(run.hints).toEqual([]);
    const away = dist(run.ghostPos, graph.nodePos(run.target.node));
    expect(away).toBeGreaterThan(DEFAULT_CONFIG.arrivalRadius * 4);
  });

  it('never repeats a target until every target has been found', () => {
    const cfg = mergeConfig({ pacman: { startGraceMs: 10_000_000 } });
    const run = new Run(graph, places, cfg, { rng: seeded(5) });
    for (let i = 0; i < places.targets.length + 2; i++) {
      const exit = graph.exits[run.target.node][0];
      Object.assign(run.ghost, { edge: exit.edge, s: exit.forward ? 0 : graph.edges[exit.edge].length });
      run.update(DT);
    }
    const ids = run.found.map((f) => f.target.id);
    expect(new Set(ids.slice(0, places.targets.length)).size).toBe(places.targets.length);
    expect(ids.length).toBe(places.targets.length + 2);
  });

  it('adds a Pac-Man after every third target, at least 400 m away', () => {
    const cfg = mergeConfig({ pacman: { startGraceMs: 10_000_000 } });
    for (let seed = 1; seed <= 5; seed++) {
      const run = new Run(graph, places, cfg, { rng: seeded(seed) });
      const spawns: number[] = [];
      run.on((e) => {
        if (e.type !== 'pacman') return;
        spawns.push(run.found.length);
        const p = e.pacman;
        expect(dist(run.pacmanPos(p), run.ghostPos)).toBeGreaterThanOrEqual(cfg.pacman.extraSpawnMinDistance);
        expect(p.distance).toBeGreaterThanOrEqual(cfg.pacman.extraSpawnMinDistance);
        expect(run.isActive(p)).toBe(false); // brief pause before it starts chasing
      });
      for (let i = 0; i < 7; i++) {
        const exit = graph.exits[run.target.node][0];
        Object.assign(run.ghost, { edge: exit.edge, s: exit.forward ? 0 : graph.edges[exit.edge].length });
        run.update(DT);
      }
      expect(spawns).toEqual([3, 6]);
      expect(run.pacmen).toHaveLength(3);
    }
  });

  it('keeps both movers on the street graph through long random play (guardrail)', () => {
    const cfg = mergeConfig({ catchRadius: -1 }); // never end, just stress movement
    const rng = seeded(42);
    const run = new Run(graph, places, cfg, { rng });
    const dirs = Object.values(SCREEN_DIRS);
    let stuckFrames = 0;
    let last = run.ghostPos;
    for (let i = 0; i < 60 * 600; i++) {
      if (i % 30 === 0) run.queueTurn(dirs[Math.floor(rng() * 4)]);
      // A player at a wall tries each direction in turn.
      if (stuckFrames > 0 && stuckFrames % 10 === 0) run.queueTurn(dirs[(stuckFrames / 10) % 4]);
      run.update(DT);
      for (const m of [run.ghost, ...run.pacmen.map((p) => p.mover)]) {
        expect(m.s).toBeGreaterThanOrEqual(0);
        expect(m.s).toBeLessThanOrEqual(graph.edges[m.edge].length + 1e-6);
      }
      const p = run.ghostPos;
      stuckFrames = dist(p, last) < 1e-6 ? stuckFrames + 1 : 0;
      last = p;
      // Stopping at a wall is fine; being unable to leave after trying every direction is not.
      expect(stuckFrames).toBeLessThan(60);
      if (run.status !== 'playing') break;
    }
    expect(run.pacmanDistance).toBeLessThan(Infinity);
  });
});
