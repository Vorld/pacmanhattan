import type { Vec } from '../engine/geo';
import type { StreetGraph } from '../engine/graph';
import type { Run } from '../engine/run';
import { ROAD_COLORS } from './basemap';
import { islandCanvas, strokeEdge, type GridFrame } from './minimap';
import { COLORS, drawGhost, drawPacman, drawStar } from './overlay';

const ROADS_PX_PER_M = 0.13; // raster resolution: sharp at 2x DPR for a ~3 km window

/**
 * Overview map: every walkable street (dead ends highlighted), landmarks,
 * Pac-Man, and optionally the target, in a window of `viewMeters` around the ghost.
 */
export class Overview {
  private ctx: CanvasRenderingContext2D;
  private roads: HTMLCanvasElement;
  private frame: GridFrame;

  constructor(
    private canvas: HTMLCanvasElement,
    private graph: StreetGraph,
    private viewMeters: number,
    private showTarget: boolean,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const island = islandCanvas(graph, ROADS_PX_PER_M);
    this.roads = island.canvas;
    this.frame = island.frame;

    // Streets never change, so draw them once.
    const dead = graph.deadEndEdges();
    const r = island.ctx;
    r.lineCap = 'round';
    r.lineJoin = 'round';
    r.lineWidth = 2;
    for (const [color, isDead] of [[ROAD_COLORS.road, 0], [ROAD_COLORS.deadEnd, 1]] as const) {
      r.strokeStyle = color;
      for (const e of graph.edges) if (dead[e.id] === isDead) strokeEdge(r, graph, this.frame, e.id);
    }
  }

  draw(run: Run, now: number) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Raster pixels -> view pixels, centered on the ghost.
    const k = w / this.viewMeters / this.frame.scale;
    const c = this.frame.map(run.ghostPos);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 - c.x * k), dpr * (h / 2 - c.y * k));
    ctx.drawImage(this.roads, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const view = (p: Vec) => {
      const s = this.frame.map(p);
      return { x: w / 2 + (s.x - c.x) * k, y: h / 2 + (s.y - c.y) * k };
    };
    const inside = (p: { x: number; y: number }, m = 0) => p.x >= m && p.y >= m && p.x <= w - m && p.y <= h - m;

    for (const lm of run.places.landmarks) {
      const p = view(this.graph.nodePos(lm.node));
      if (!inside(p)) continue;
      drawStar(ctx, p.x, p.y, run.visited.includes(lm) ? 3.5 : 4.5, run.visited.includes(lm) ? COLORS.visited : COLORS.landmark);
    }

    if (this.showTarget) this.drawTarget(view(this.graph.nodePos(run.target.node)), w, h, now, run.found.length + 1);

    for (const p of run.pacmen) {
      const at = view(run.pacmanPos(p));
      if (inside(at, -6)) drawPacman(ctx, at.x, at.y, 0, now, run.isActive(p), 5);
    }
    drawGhost(ctx, w / 2, h / 2, 0, now, 5);
  }

  /** Numbered target star, or an arrow on the border pointing to it when it's out of view. */
  private drawTarget(p: { x: number; y: number }, w: number, h: number, now: number, number: number) {
    const { ctx } = this;
    const m = 10;
    if (p.x >= m && p.y >= m && p.x <= w - m && p.y <= h - m) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 + 2 * Math.sin(now / 200), 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.target;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawStar(ctx, p.x, p.y, 6, COLORS.target);
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.target;
      ctx.fillText(String(number), p.x, p.y - 11);
      return;
    }
    const angle = Math.atan2(p.y - h / 2, p.x - w / 2);
    const r = Math.min((w / 2 - m) / Math.abs(Math.cos(angle) || 1e-6), (h / 2 - m) / Math.abs(Math.sin(angle) || 1e-6));
    ctx.save();
    ctx.translate(w / 2 + Math.cos(angle) * r, h / 2 + Math.sin(angle) * r);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = COLORS.target;
    ctx.fill();
    ctx.restore();
  }
}
