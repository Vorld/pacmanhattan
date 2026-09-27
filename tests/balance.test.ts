// Balance simulation, skipped by default. Run with `npm run simulate`.
// Two bots bracket real play: one only flees Pac-Man (how long can you
// survive?), one runs the shortest route to each target in turn, ignoring
// Pac-Man (how many targets can you chain by racing?).
import { describe, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { nodeAhead } from '../src/engine/movement';
import { PathFinder } from '../src/engine/pathfinding';
import { Run } from '../src/engine/run';
import { loadManhattan, seeded } from './helpers';

const { graph, places } = loadManhattan();

describe.skipIf(!process.env.SIM)('balance simulation', () => {
  it('reports survival times for a fleeing bot', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed);
      const run = new Run(graph, places, DEFAULT_CONFIG, { rng });
      let lastNode = -1;
      while (run.status === 'playing' && run.time < 600) {
        const node = nodeAhead(graph, run.ghost);
        if (node !== lastNode || !run.ghost.moving) {
          lastNode = node;
          // Pick the exit whose far end is farthest from the nearest Pac-Man, with a little noise.
          const pacs = run.pacmen.map((p) => run.pacmanPos(p));
          let best = graph.exits[node][0];
          let bestScore = -Infinity;
          for (const x of graph.exits[node]) {
            const p = graph.nodePos(graph.otherEnd(x.edge, node));
            const score = Math.min(...pacs.map((q) => Math.hypot(p.x - q.x, p.y - q.y))) + rng() * 40;
            if (score > bestScore) [best, bestScore] = [x, score];
          }
          run.queueTurn(graph.exitDirection(best));
        }
        run.update(1 / 30);
      }
      times.push(run.time);
    }
    times.sort((a, b) => a - b);
    const q = (p: number) => times[Math.floor(p * (times.length - 1))].toFixed(0);
    console.log(`fleeing bot survival (s): min ${q(0)} p25 ${q(0.25)} median ${q(0.5)} p75 ${q(0.75)} max ${q(1)}`);
  }, 120_000);

  it('reports how many targets a bot racing straight to each one finds', () => {
    const finder = new PathFinder(graph);
    const counts: number[] = [];
    const times: number[] = [];
    const runs = 40;
    for (let seed = 1; seed <= runs; seed++) {
      const run = new Run(graph, places, DEFAULT_CONFIG, { rng: seeded(seed) });
      const goalFor = (t: number) => ({ edge: graph.exits[t][0].edge, s: graph.exits[t][0].forward ? 0 : graph.edges[graph.exits[t][0].edge].length });
      let lastNode = -1;
      while (run.status === 'playing' && run.time < 600) {
        const node = nodeAhead(graph, run.ghost);
        if (node !== lastNode || !run.ghost.moving) {
          lastNode = node;
          const path = finder.find({ edge: run.ghost.edge, s: run.ghost.s }, goalFor(run.target.node));
          const next = path?.nodes.find((n) => n !== node);
          const exit = next === undefined ? undefined : graph.exits[node].find((x) => graph.otherEnd(x.edge, node) === next);
          if (exit) run.queueTurn(graph.exitDirection(exit));
        }
        run.update(1 / 30);
      }
      counts.push(run.found.length);
      times.push(run.time);
    }
    times.sort((a, b) => a - b);
    counts.sort((a, b) => a - b);
    const withOne = counts.filter((c) => c > 0).length;
    console.log(
      `racing bot: found ≥1 target in ${withOne}/${runs} runs, median ${counts[runs >> 1]} found (max ${counts[runs - 1]}), median run ${times[runs >> 1].toFixed(0)} s`,
    );
  }, 120_000);
});
