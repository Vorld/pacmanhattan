const MUTE_KEY = 'pacmanhattan.muted';

/** Tiny WebAudio synth: no audio files to load. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private nextBeep = 0;
  muted: boolean;

  constructor() {
    this.muted = safeGet(MUTE_KEY) === '1';
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    safeSet(MUTE_KEY, this.muted ? '1' : '0');
    return this.muted;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.08, slideTo?: number) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  landmark() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.07, 0.12, 'triangle', 0.1));
  }

  start() {
    [392, 523, 659].forEach((f, i) => this.tone(f, i * 0.1, 0.14, 'square', 0.06));
  }

  caught() {
    this.tone(880, 0, 1.1, 'sawtooth', 0.08, 80);
  }

  win() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.16, 'triangle', 0.1));
  }

  /** Call every frame with 0 (safe) to 1 (about to be caught); beeps faster as danger rises. */
  danger(level: number) {
    if (!this.ctx || level <= 0) return;
    const now = this.ctx.currentTime;
    if (now < this.nextBeep) return;
    this.tone(220 + level * 440, 0, 0.07, 'square', 0.035 + level * 0.05);
    this.nextBeep = now + 0.9 - level * 0.75;
  }
}

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
