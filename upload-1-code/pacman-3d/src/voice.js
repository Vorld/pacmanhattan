// Narrator: short voice lines recorded once with ElevenLabs (tools/make_voice.py), played from data/voice/.
(function () {
  const PM = (window.PM = window.PM || {});
  class Voice {
    constructor() { this.muted = false; this.clips = {}; this.last = {}; this.cur = null; }
    // gap: don't repeat this line within that many seconds
    play(id, gap = 0) {
      if (this.muted) return;
      const t = performance.now() / 1000;
      if (gap && this.last[id] && t - this.last[id] < gap) return;
      this.last[id] = t;
      let a = this.clips[id];
      if (!a) { a = this.clips[id] = new Audio('data/voice/' + id + '.mp3'); a.preload = 'auto'; a.volume = 0.9; }
      if (this.cur && this.cur !== a) this.cur.pause();
      a.currentTime = 0;
      a.play().catch(() => {});
      this.cur = a;
    }
    setMuted(m) { this.muted = m; if (m && this.cur) this.cur.pause(); }
  }
  PM.voice = new Voice();
})();
