import { toLonLat, type Vec } from '../engine/geo';
import { headingOf } from '../engine/movement';
import type { Run } from '../engine/run';
import type { BaseMap } from './basemap';

export const COLORS = {
  ghost: '#5ef1ff',
  pacman: '#ffe135',
  landmark: '#ffb347',
  visited: '#3fd6a0',
  danger: '#ff3b5c',
};

const SPRITE_R = 13;
const TRAIL_POINTS = 24;

/** Canvas drawn above the map every frame: sprites, landmarks and danger cues. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private base: BaseMap,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private screen(p: Vec) {
    return this.base.project(toLonLat(p.x, p.y));
  }

  draw(run: Run, now: number) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawLandmarks(run, now);
    this.drawTrail(run);

    const ghost = this.screen(run.ghostPos);
    const pac = this.screen(run.pacmanPos);
    const facing = (m: typeof run.ghost, at: { x: number; y: number }, pos: Vec) => {
      const h = headingOf(run.graph, m);
      const ahead = this.screen({ x: pos.x + h.x * 10, y: pos.y + h.y * 10 });
      return Math.atan2(ahead.y - at.y, ahead.x - at.x);
    };
    drawPacman(ctx, pac.x, pac.y, facing(run.pacman, pac, run.pacmanPos), now, run.pacmanActive);
    drawGhost(ctx, ghost.x, ghost.y, facing(run.ghost, ghost, run.ghostPos), now);
    this.drawDanger(run, pac, now);
  }

  private drawLandmarks(run: Run, now: number) {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const lm of run.places.landmarks) {
      const p = this.screen(run.graph.nodePos(lm.node));
      if (p.x < -80 || p.y < -40 || p.x > this.w + 80 || p.y > this.h + 40) continue;
      const done = run.visited.includes(lm);
      const color = done ? COLORS.visited : COLORS.landmark;
      ctx.globalAlpha = done ? 0.6 : 1;
      if (!done) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14 + pulse * 6, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.35 + 0.3 * (1 - pulse);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawStar(ctx, p.x, p.y, done ? 6 : 9, color);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2,3,10,0.85)';
      ctx.strokeText(lm.name, p.x, p.y - 18);
      ctx.fillStyle = color;
      ctx.fillText(lm.name, p.x, p.y - 18);
      ctx.globalAlpha = 1;
    }
  }

  private drawTrail(run: Run) {
    const { ctx } = this;
    const pts = [...run.route.slice(-TRAIL_POINTS), run.ghostPos].map((p) => this.screen(p));
    for (let i = 1; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = COLORS.ghost;
      ctx.globalAlpha = (i / pts.length) * 0.5;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Red vignette as Pac-Man closes in, and an edge arrow when he's off-screen. */
  private drawDanger(run: Run, pac: { x: number; y: number }, now: number) {
    const { ctx } = this;
    const warn = run.config.warnDistance;
    const closeness = run.pacmanActive ? Math.max(0, 1 - run.pacmanDistance / warn) : 0;
    if (closeness > 0) {
      const beat = 0.75 + 0.25 * Math.sin(now / (120 - closeness * 60));
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      g.addColorStop(0, 'rgba(255,59,92,0)');
      g.addColorStop(1, `rgba(255,59,92,${0.55 * closeness * beat})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const margin = 28;
    const offscreen = pac.x < 0 || pac.y < 0 || pac.x > this.w || pac.y > this.h;
    if (!offscreen) return;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const angle = Math.atan2(pac.y - cy, pac.x - cx);
    // Intersect the ray from the center with the inset screen rectangle.
    const sx = (cx - margin) / Math.abs(Math.cos(angle) || 1e-6);
    const sy = (cy - margin) / Math.abs(Math.sin(angle) || 1e-6);
    const r = Math.min(sx, sy);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const near = run.pacmanDistance < warn;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fillStyle = near ? COLORS.danger : COLORS.pacman;
    ctx.globalAlpha = near ? 0.7 + 0.3 * Math.sin(now / 90) : 0.8;
    ctx.fill();
    ctx.restore();
    if (Number.isFinite(run.pacmanDistance)) {
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = near ? COLORS.danger : COLORS.pacman;
      const lx = x - Math.cos(angle) * 26;
      const ly = y - Math.sin(angle) * 26 + 4;
      ctx.fillText(`${Math.round(run.pacmanDistance)} m`, lx, ly);
    }
  }
}

export function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, look: number, now: number, r = SPRITE_R) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = COLORS.ghost;
  ctx.shadowBlur = 14;
  ctx.fillStyle = COLORS.ghost;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r, Math.PI, 0);
  const bottom = r * 0.95;
  const waves = 4;
  const phase = Math.floor(now / 140) % 2;
  ctx.lineTo(r, bottom);
  for (let i = 0; i < waves; i++) {
    const x0 = r - ((i + 0.5) * 2 * r) / waves;
    const x1 = r - ((i + 1) * 2 * r) / waves;
    ctx.quadraticCurveTo(x0, bottom - r * (phase ? 0.35 : 0.1) - (i % 2) * r * 0.2, x1, bottom);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // Eyes follow the direction of travel.
  const ex = Math.cos(look) * r * 0.18;
  const ey = Math.sin(look) * r * 0.18;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(side * r * 0.38, -r * 0.25, r * 0.28, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c2cff';
    ctx.beginPath();
    ctx.arc(side * r * 0.38 + ex, -r * 0.25 + ey, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPacman(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  now: number,
  awake = true,
  r = SPRITE_R + 2,
) {
  const mouth = awake ? (0.08 + 0.32 * Math.abs(Math.sin(now / 90))) * Math.PI : 0.05 * Math.PI;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.shadowColor = COLORS.pacman;
  ctx.shadowBlur = 16;
  ctx.fillStyle = COLORS.pacman;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
