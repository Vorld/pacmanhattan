// Tiny WebAudio sound kit (no asset files).
(function () {
  const PM = (window.PM = window.PM || {});

  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.beatTimer = 0;
      this.dist = Infinity;
      this.running = false;
    }
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.35;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    }
    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
      return this.muted;
    }
    tone(freq, dur, type = 'square', vol = 0.3, when = 0, slideTo) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    start() { this.unlock(); this.running = true; this.loop(); }
    stop() { this.running = false; clearTimeout(this.timer); }
    pause(p) { if (p) this.stop(); else this.start(); }
    proximity(d) { this.dist = d; }
    loop() {
      if (!this.running) return;
      // heartbeat speeds up as the chomper closes in
      const d = this.dist;
      let gap = 1.1;
      if (d < 600) {
        gap = 0.18 + (d / 600) * 0.8;
        const v = 0.08 + (1 - d / 600) * 0.25;
        this.tone(70, 0.12, 'sine', v);
        this.tone(58, 0.14, 'sine', v * 0.8, 0.12);
      }
      this.timer = setTimeout(() => this.loop(), gap * 1000);
    }
    ding() { this.tone(880, 0.12, 'triangle', 0.25); this.tone(1320, 0.2, 'triangle', 0.22, 0.09); }
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.14, i * 0.1)); }
    chomp() { this.tone(500, 0.6, 'sawtooth', 0.25, 0, 60); this.tone(300, 0.5, 'square', 0.12, 0.1, 40); }
  }

  PM.Audio = Audio;
})();
