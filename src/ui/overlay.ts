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
  target: '#ff4fd8',
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

  draw(run: Run, now: number, showTarget: boolean) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawLandmarks(run, now);
    if (showTarget) this.drawTarget(run, now);
    this.drawTrail(run);

    const ghost = this.screen(run.ghostPos);
    const facing = (m: typeof run.ghost, at: { x: number; y: number }, pos: Vec) => {
      const h = headingOf(run.graph, m);
      const ahead = this.screen({ x: pos.x + h.x * 10, y: pos.y + h.y * 10 });
      return Math.atan2(ahead.y - at.y, ahead.x - at.x);
    };
    for (const p of run.pacmen) {
      const pos = run.pacmanPos(p);
      const at = this.screen(pos);
      drawPacman(ctx, at.x, at.y, facing(p.mover, at, pos), now, run.isActive(p));
    }
    drawGhost(ctx, ghost.x, ghost.y, facing(run.ghost, ghost, run.ghostPos), now);
    this.drawDanger(run, now);
  }

  private onScreen(p: { x: number; y: number }, margin = 0) {
    return p.x >= margin && p.y >= margin && p.x <= this.w - margin && p.y <= this.h - margin;
  }

  /** The current target, labeled with its number; an edge arrow when it's off-screen. */
  private drawTarget(run: Run, now: number) {
    const { ctx } = this;
    const pos = run.graph.nodePos(run.target.node);
    const p = this.screen(pos);
    const label = `TARGET ${run.found.length + 1}`;
    if (!this.onScreen(p)) {
      const g = run.ghostPos;
      this.edgeArrow(p, COLORS.target, 0.9, `${label} · ${formatMeters(Math.hypot(pos.x - g.x, pos.y - g.y))}`);
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    ctx.save();
    ctx.shadowColor = COLORS.target;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18 + pulse * 8, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.target;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5 + 0.4 * (1 - pulse);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawStar(ctx, p.x, p.y, 13, COLORS.target);
    ctx.restore();
    ctx.font = '400 10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(2,3,10,0.9)';
    ctx.strokeText(label, p.x, p.y - 30);
    ctx.fillStyle = COLORS.target;
    ctx.fillText(label, p.x, p.y - 30);
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

  /** Red vignette as the nearest Pac-Man closes in, and an edge arrow for each one off-screen. */
  private drawDanger(run: Run, now: number) {
    const { ctx } = this;
    const warn = run.config.warnDistance;
    const nearest = run.pacmanDistance;
    const closeness = Math.max(0, 1 - nearest / warn);
    if (closeness > 0) {
      const beat = 0.75 + 0.25 * Math.sin(now / (120 - closeness * 60));
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      g.addColorStop(0, 'rgba(255,59,92,0)');
      g.addColorStop(1, `rgba(255,59,92,${0.55 * closeness * beat})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    for (const p of run.pacmen) {
      const at = this.screen(run.pacmanPos(p));
      if (this.onScreen(at)) continue;
      const near = run.isActive(p) && p.distance < warn;
      const alpha = near ? 0.7 + 0.3 * Math.sin(now / 90) : 0.8;
      const label = Number.isFinite(p.distance) ? formatMeters(p.distance) : '';
      this.edgeArrow(at, near ? COLORS.danger : COLORS.pacman, alpha, label);
    }
  }

  /** Arrow on the screen border pointing toward an off-screen point, with a label inside it. */
  private edgeArrow(to: { x: number; y: number }, color: string, alpha: number, label: string) {
    const { ctx } = this;
    const margin = 28;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const angle = Math.atan2(to.y - cy, to.x - cx);
    // Intersect the ray from the center with the inset screen rectangle.
    const sx = (cx - margin) / Math.abs(Math.cos(angle) || 1e-6);
    const sy = (cy - margin) / Math.abs(Math.sin(angle) || 1e-6);
    const r = Math.min(sx, sy);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.restore();
    if (!label) return;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2,3,10,0.85)';
    const lx = x - Math.cos(angle) * 30;
    const ly = y - Math.sin(angle) * 22 + 4;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
  }
}

export function formatMeters(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
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
