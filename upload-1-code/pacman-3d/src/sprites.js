// Canvas sprites: ghost, chomper, landmark markers, arrows.
(function () {
  const PM = (window.PM = window.PM || {});

  const Sprites = {
    ghostColor: '#7b5cff',

    ghost(ctx, x, y, heading, t, s, scared) {
      const r = 13 * s;
      const bob = Math.sin(t * 8) * 1.2 * s;
      ctx.save();
      ctx.translate(x, y + bob);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(0, r * 1.25 - bob, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = scared ? (Math.floor(t * 8) % 2 ? '#2f5bff' : '#ffffff') : this.ghostColor;
      ctx.strokeStyle = 'rgba(20,10,60,0.55)'; ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r, Math.PI, 0);
      const base = r * 0.95, waves = 4, ww = (2 * r) / waves;
      ctx.lineTo(r, base);
      for (let i = 0; i < waves; i++) {
        const x0 = r - i * ww;
        const off = Math.sin(t * 14 + i) * 2 * s;
        ctx.quadraticCurveTo(x0 - ww / 2, base - 5 * s + off, x0 - ww, base);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // eyes look where we're heading
      const lx = heading[0] * 3 * s, ly = heading[1] * 3 * s;
      for (const ex of [-r * 0.38, r * 0.38]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(ex, -r * 0.2, r * 0.27, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = scared ? '#ff3b3b' : '#1b2a8a';
        ctx.beginPath(); ctx.arc(ex + lx, -r * 0.2 + ly, r * 0.14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },

    // Original round yellow chomper with a cap-like brow ridge (not Pac-Man).
    chomper(ctx, x, y, ang, open, s, spawnFx) {
      const r = 16 * s;
      ctx.save();
      ctx.translate(x, y);
      if (spawnFx > 0) {
        ctx.globalAlpha = 1 - spawnFx;
        ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.arc(0, 0, r * (1 + spawnFx * 3), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(0, r * 1.05, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(ang);
      const m = 0.08 + open * 0.55;
      ctx.fillStyle = '#ffd21f';
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, m, Math.PI * 2 - m);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // teeth
      ctx.fillStyle = '#fff';
      for (const side of [1, -1]) {
        for (let i = 0; i < 3; i++) {
          const a = side * (m - 0.02);
          const d = r * (0.45 + i * 0.18);
          const px = Math.cos(a) * d, py = Math.sin(a) * d;
          ctx.beginPath();
          ctx.moveTo(px - 2.5 * s, py);
          ctx.lineTo(px + 2.5 * s, py);
          ctx.lineTo(px, py - side * 4 * s);
          ctx.closePath(); ctx.fill();
        }
      }
      // angry brow + eye
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(r * 0.18, -r * 0.5, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.82); ctx.lineTo(r * 0.45, -r * 0.62); ctx.stroke();
      ctx.restore();
    },

    landmark(ctx, x, y, s, name, visited) {
      ctx.save();
      ctx.translate(x, y);
      const r = 11 * s;
      ctx.fillStyle = visited ? '#9aa0a6' : '#ff5a36';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * s;
      star(ctx, 0, 0, r, r * 0.45);
      ctx.fill(); ctx.stroke();
      ctx.font = `600 ${11 * s}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5 * s; ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.fillStyle = visited ? '#70757a' : '#b3261e';
      ctx.strokeText(name, 0, r + 13 * s);
      ctx.fillText(name, 0, r + 13 * s);
      ctx.restore();
    },

    hintArrow(ctx, cx, cy, ang, s, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const d = 58 * s;
      ctx.fillStyle = '#12a150';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(d + 22 * s, 0);
      ctx.lineTo(d, -12 * s);
      ctx.lineTo(d + 4 * s, -4 * s);
      ctx.lineTo(d - 16 * s, -4 * s);
      ctx.lineTo(d - 16 * s, 4 * s);
      ctx.lineTo(d + 4 * s, 4 * s);
      ctx.lineTo(d, 12 * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    },

    edgeArrow(ctx, W, H, tx, ty, s, dist, color = '#ffd21f') {
      const cx = W / 2, cy = H / 2;
      const ang = Math.atan2(ty - cy, tx - cx);
      const m = 34 * s;
      // intersect ray with inset screen rect
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const kx = dx ? ((dx > 0 ? W - m : m) - cx) / dx : Infinity;
      const ky = dy ? ((dy > 0 ? H - m : m) - cy) / dy : Infinity;
      const k = Math.min(kx, ky);
      const x = cx + dx * k, y = cy + dy * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const pulse = dist < 400 ? 1 + 0.15 * Math.sin(performance.now() / 90) : 1;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = color; ctx.strokeStyle = '#2a2140'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(16 * s, 0); ctx.lineTo(-10 * s, -12 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(-10 * s, 12 * s); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.rotate(-ang);
      ctx.font = `700 ${11 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = '#3b2f00';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3 * s;
      const label = Math.round(dist) + ' m';
      ctx.strokeText(label, -dx * 26 * s, -dy * 26 * s + 4 * s);
      ctx.fillText(label, -dx * 26 * s, -dy * 26 * s + 4 * s);
      ctx.restore();
    },
  };

  function star(ctx, x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  PM.Sprites = Sprites;
})();
