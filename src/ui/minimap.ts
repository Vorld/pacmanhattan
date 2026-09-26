import { toGrid, type Vec } from '../engine/geo';
import type { StreetGraph } from '../engine/graph';
import type { Run } from '../engine/run';
import { COLORS, drawStar } from './overlay';

/** Maps world points into a canvas, rotated so uptown is up (matching the main map). */
export class GridFrame {
  private minU = Infinity;
  private maxU = -Infinity;
  private minV = Infinity;
  private maxV = -Infinity;
  scale = 1;
  offX = 0;
  offY = 0;

  constructor(points: Vec[], width: number, height: number, pad = 6) {
    for (const p of points) {
      const { u, v } = toGrid(p);
      this.minU = Math.min(this.minU, u);
      this.maxU = Math.max(this.maxU, u);
      this.minV = Math.min(this.minV, v);
      this.maxV = Math.max(this.maxV, v);
    }
    const spanU = Math.max(1, this.maxU - this.minU);
    const spanV = Math.max(1, this.maxV - this.minV);
    this.scale = Math.min((width - pad * 2) / spanU, (height - pad * 2) / spanV);
    this.offX = (width - spanU * this.scale) / 2;
    this.offY = (height - spanV * this.scale) / 2;
  }

  map(p: Vec) {
    const { u, v } = toGrid(p);
    return { x: this.offX + (u - this.minU) * this.scale, y: this.offY + (this.maxV - v) * this.scale };
  }
}

export function strokeEdge(ctx: CanvasRenderingContext2D, g: StreetGraph, frame: GridFrame, edgeId: number) {
  const e = g.edges[edgeId];
  ctx.beginPath();
  for (let i = 0; i < e.xs.length; i++) {
    const p = frame.map({ x: e.xs[i], y: e.ys[i] });
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

const FOG_PX_PER_M = 0.07; // fog layer resolution: the whole island is ~1.5k px tall

/**
 * Minimap of discovered streets only. The whole island's fog layer is kept
 * offscreen and the minimap shows a window of it centered on the ghost.
 */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private fog: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogFrame: GridFrame;

  constructor(
    private canvas: HTMLCanvasElement,
    private graph: StreetGraph,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const nodes = Array.from({ length: graph.nodeCount }, (_, n) => graph.nodePos(n));
    const grid = nodes.map(toGrid);
    const span = (vals: number[]) => Math.max(...vals) - Math.min(...vals);
    const width = Math.ceil(span(grid.map((g) => g.u)) * FOG_PX_PER_M) + 20;
    const height = Math.ceil(span(grid.map((g) => g.v)) * FOG_PX_PER_M) + 20;
    this.fog = document.createElement('canvas');
    this.fog.width = width;
    this.fog.height = height;
    this.fogCtx = this.fog.getContext('2d')!;
    this.fogFrame = new GridFrame(nodes, width, height, 10);
  }

  /** Clear the fog layer for a new run. */
  reset(run: Run) {
    this.fogCtx.clearRect(0, 0, this.fog.width, this.fog.height);
    run.newlyDiscovered = [...run.discovered];
  }

  draw(run: Run) {
    const f = this.fogCtx;
    f.strokeStyle = '#4d6bff';
    f.lineWidth = 1.2;
    for (const id of run.newlyDiscovered) strokeEdge(f, this.graph, this.fogFrame, id);
    run.newlyDiscovered = [];

    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    const { ctx } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const center = this.fogFrame.map(run.ghostPos);
    const ox = w / 2 - center.x;
    const oy = h / 2 - center.y;
    ctx.drawImage(this.fog, ox, oy);

    const toView = (p: Vec) => {
      const s = this.fogFrame.map(p);
      return { x: s.x + ox, y: s.y + oy };
    };
    for (const lm of run.visited) {
      const p = toView(this.graph.nodePos(lm.node));
      drawStar(ctx, p.x, p.y, 4, COLORS.visited);
    }
    const dot = (p: Vec, color: string, r: number) => {
      const s = toView(p);
      // Clamp to the edge so Pac-Man's direction stays readable when he's far away.
      const x = Math.max(r, Math.min(w - r, s.x));
      const y = Math.max(r, Math.min(h - r, s.y));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    dot(run.pacmanPos, COLORS.pacman, 3);
    dot(run.ghostPos, COLORS.ghost, 3.5);
  }
}
