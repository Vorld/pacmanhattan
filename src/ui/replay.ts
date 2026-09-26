import type { Vec } from '../engine/geo';
import type { Run } from '../engine/run';
import { GridFrame, strokeEdge } from './minimap';
import { COLORS, drawGhost, drawPacman, drawStar } from './overlay';

const REPLAY_MS = 6000;
const CONTEXT_M = 350; // show this much map around the route

/** End-screen map of the run: discovered streets, route replay, and where the target was. */
export class RouteReplay {
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private run: Run,
  ) {}

  play() {
    cancelAnimationFrame(this.raf);
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / REPLAY_MS);
      this.render(t, now);
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private render(t: number, now: number) {
    const { canvas, run } = this;
    const g = run.graph;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetPos = g.nodePos(run.target.node);
    const pad = (p: Vec) => [
      { x: p.x - CONTEXT_M, y: p.y - CONTEXT_M },
      { x: p.x + CONTEXT_M, y: p.y + CONTEXT_M },
    ];
    const frame = new GridFrame([...run.route, targetPos].flatMap(pad), w, h, 12);

    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(77,107,255,0.45)';
    for (const id of run.discovered) strokeEdge(ctx, g, frame, id);

    const route = (pts: Vec[], color: string, width: number) => {
      const n = Math.max(1, Math.floor(pts.length * t));
      ctx.beginPath();
      pts.slice(0, n).forEach((p, i) => {
        const s = frame.map(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.stroke();
      return frame.map(pts[n - 1]);
    };
    ctx.globalAlpha = 0.5;
    const pacHead = route(run.pacmanRoute, COLORS.pacman, 2);
    ctx.globalAlpha = 1;
    const ghostHead = route(run.route, COLORS.ghost, 3);

    for (const lm of run.visited) {
      const p = frame.map(g.nodePos(lm.node));
      drawStar(ctx, p.x, p.y, 6, COLORS.visited);
    }
    const tp = frame.map(targetPos);
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 12 + 3 * Math.sin(now / 200), 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.landmark;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawStar(ctx, tp.x, tp.y, 9, COLORS.landmark);
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.landmark;
    ctx.fillText(run.target.name, tp.x, tp.y - 18);

    drawPacman(ctx, pacHead.x, pacHead.y, 0, now, true, 8);
    drawGhost(ctx, ghostHead.x, ghostHead.y, 0, now, 8);
  }
}
