import type { ScreenDir } from '../engine/geo';

const KEYS: Record<string, ScreenDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

const SWIPE_PX = 28;

/** Arrow keys / WASD and touch swipes, reported as screen directions. */
export function bindDirectionInput(target: HTMLElement, onDir: (d: ScreenDir) => void) {
  window.addEventListener('keydown', (e) => {
    const dir = KEYS[e.code];
    if (!dir) return;
    e.preventDefault();
    onDir(dir);
  });

  // Swipes re-anchor after each direction so one continuous drag can steer through several turns.
  let start: { x: number; y: number; id: number } | null = null;
  let touches = 0;
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    touches++;
    start = touches === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; // two fingers = pinch zoom
  });
  target.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  const end = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    touches = Math.max(0, touches - 1);
    if (start?.id === e.pointerId) start = null;
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}
