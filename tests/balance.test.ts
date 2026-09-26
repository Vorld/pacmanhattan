// Balance simulation, skipped by default. Run with `npm run simulate`.
// A bot flees Pac-Man at every intersection (no target seeking), which gives a
// rough upper bound on how long a pure evader survives with the current config.
import { describe, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { nodeAhead } from '../src/engine/movement';
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
          // Pick the exit whose far end is farthest from Pac-Man, with a little noise.
          const pac = run.pacmanPos;
          let best = graph.exits[node][0];
          let bestScore = -Infinity;
          for (const x of graph.exits[node]) {
            const p = graph.nodePos(graph.otherEnd(x.edge, node));
            const score = Math.hypot(p.x - pac.x, p.y - pac.y) + rng() * 40;
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
});
