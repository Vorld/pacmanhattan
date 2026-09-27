// DOM overlays: title, HUD, toasts, minimap, pause, game over, local high scores.
(function () {
  const PM = (window.PM = window.PM || {});
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'pacmanhattan.scores.v1' + ((window.PM_BOROUGH && window.PM_BOROUGH !== 'manhattan') ? ':' + window.PM_BOROUGH : '');

  function loadScores() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveScores(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    init(h) {
      this.h = h;
      $('btn-start').onclick = () => h.onStart();
      $('btn-again').onclick = () => h.onStart();
      $('btn-resume').onclick = () => h.onResume();
      $('btn-menu').onclick = () => h.onMenu();
      $('btn-mute').onclick = () => h.onToggleMute();
      $('btn-save').onclick = () => this.saveInitials();
      $('btn-card').onclick = () => h.onCloseCard();
      $('initials').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.saveInitials(); });
      this.mini = $('minimap');
      this.miniCtx = this.mini.getContext('2d');
      this.toastEl = $('toasts');
      this.renderScores($('title-scores'));
    },

    show(id, on) { $(id).classList.toggle('hidden', !on); },
    showTitle() { this.show('title', true); this.show('hud', false); this.show('over', false); this.show('pause', false); this.renderScores($('title-scores')); },
    showHUD() { this.show('title', false); this.show('over', false); this.show('pause', false); this.show('hud', true); this.toastEl.innerHTML = ''; },
    hideHUD() { this.show('hud', false); },
    showPause(on) { this.show('pause', on); },
    showStartHint(on) { if (this._sh !== on) { this._sh = on; this.show('start-hint', on); } },
    setMuted(m) { $('btn-mute').textContent = m ? '🔇' : '🔊'; },

    setScore(s) { if (this._score !== s) { this._score = s; $('score').textContent = s.toLocaleString(); } },
    setTask(t, cat, icon, n) {
      $('task-num').textContent = 'Task ' + n;
      $('task-name').textContent = t.name;
      $('task-cat').textContent = icon + ' ' + cat;
      const card = $('task');
      card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    },
    setHints(list) {
      const el = $('hints');
      if (!list.length) { el.innerHTML = '<div class="hint muted">No hints yet. Reach a ★ landmark to get one.</div>'; return; }
      el.innerHTML = list.slice(0, 3).map((h, i) => `<div class="hint ${i ? 'old' : ''}"><b>${esc(h.from)}:</b> ${esc(h.text)}</div>`).join('');
    },
    setStreet(a, b) {
      const txt = a ? (b ? `${a} & ${b}` : a) : '';
      if (this._st !== txt) { this._st = txt; $('street').textContent = txt; $('street').classList.toggle('hidden', !txt); }
    },

    toast({ title, body, hint, kind, secs }) {
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.innerHTML = `<div class="t-title">${esc(title)}</div>${body ? `<div class="t-body">${esc(body)}</div>` : ''}${hint ? `<div class="t-hint">Hint: ${esc(hint)}</div>` : ''}`;
      this.toastEl.prepend(el);
      while (this.toastEl.children.length > 3) this.toastEl.lastChild.remove();
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, (secs || 5) * 1000);
    },

    setLoading(p) {
      const el = $('loading');
      const done = p >= 0.999;
      if (this._ld === done && !(!done && Math.abs((this._lp || 0) - p) > 0.02)) return;
      this._ld = done; this._lp = p;
      const city = (window.PM_DATA.map && window.PM_DATA.map.city) || 'Manhattan';
      el.textContent = done ? `${city} is ready.` : `Building ${city} in 3D… ${Math.round(p * 100)}%`;
      el.classList.toggle('ready', done);
    },

    // ---------- landmark / target card ----------
    showCard({ kind, place, points, hint, cat }) {
      const p = place;
      const sv = p.lat ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}` : null;
      const img = p.img
        ? `<figure><img src="${p.img}" alt="${esc(p.name)}"><figcaption>Photo: ${esc(p.credit || 'Wikimedia Commons')}${p.file ? ` · <a href="${esc(p.file)}" target="_blank" rel="noopener">source</a>` : ''}</figcaption></figure>`
        : `<div class="noimg">${esc(p.name)}</div>`;
      $('card-body').innerHTML = `
        ${img}
        <div class="card-text">
          <div class="eyebrow ${kind}">${kind === 'found' ? 'Found it! +' + points.toLocaleString() : '★ Landmark +' + points}</div>
          <h2>${esc(p.name)}</h2>
          ${cat ? `<div class="muted small">${esc(cat)}</div>` : ''}
          <div class="fact"><b>Fun fact:</b> ${esc(p.fact)}</div>
          ${p.about ? `<p class="about">${esc(p.about)}</p>` : ''}
          ${hint ? `<div class="card-hint"><b>Hint:</b> ${esc(hint)}<div class="small">A green arrow points the way for a few seconds.</div></div>` : ''}
          <div class="links">
            ${sv ? `<a href="${sv}" target="_blank" rel="noopener">Open Street View ↗</a>` : ''}
            ${p.wiki ? `<a href="${esc(p.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}
          </div>
        </div>`;
      $('btn-card').textContent = kind === 'found' ? 'Next task (Space)' : 'Keep running (Space)';
      this.show('card', true);
      setTimeout(() => $('btn-card').focus(), 30);
    },
    hideCard() { this.show('card', false); },

    // ---------- minimap ----------
    buildMini(graph, map) {
      const S = 0.075; // px per metre (before DPR)
      const dpr = Math.min(2, devicePixelRatio || 1);
      const r = map.islands.find((x) => x.length > 1000) || map.islands[0];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (map.box) [x0, y0, x1, y1] = map.box;
      x0 -= 400; y0 -= 400; x1 += 400; y1 += 400;
      const k = S * dpr;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((x1 - x0) * k); cv.height = Math.ceil((y1 - y0) * k);
      const g = cv.getContext('2d');
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      g.fillStyle = '#9cc6d9'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = '#e9e4da';
      for (const m of map.mainland) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.fillStyle = '#f6f2ea';
      for (const m of map.islands) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.strokeStyle = '#8f8a80'; g.lineWidth = 9;
      g.beginPath();
      for (const e of graph.edges) { g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); }
      g.stroke();
      const fog = document.createElement('canvas');
      fog.width = cv.width; fog.height = cv.height;
      const fg = fog.getContext('2d');
      fg.fillStyle = 'rgba(40,44,60,0.82)'; fg.fillRect(0, 0, fog.width, fog.height);
      this.miniData = { cv, fog, fg, x0, y0, k, dpr, revealed: new Set() };
    },

    drawMinimap({ graph, map, fog, ghost, chomper, landmarks, visited, cam, viewW, viewH }) {
      if (!this.miniData) this.buildMini(graph, map);
      const M = this.miniData, c = this.mini, g = this.miniCtx;
      if (fog.size < M.revealed.size) { // new run: reset fog layer
        M.fg.globalCompositeOperation = 'source-over';
        M.fg.clearRect(0, 0, M.fog.width, M.fog.height);
        M.fg.fillStyle = 'rgba(40,44,60,0.82)'; M.fg.fillRect(0, 0, M.fog.width, M.fog.height);
        M.revealed = new Set();
      }
      M.fg.globalCompositeOperation = 'destination-out';
      for (const key of fog) {
        if (M.revealed.has(key)) continue;
        M.revealed.add(key);
        const [cx, cy] = key.split(',').map(Number);
        M.fg.fillRect((cx * 100 - M.x0) * M.k, (cy * 100 - M.y0) * M.k, 100 * M.k + 0.5, 100 * M.k + 0.5);
      }
      const cw = c.clientWidth * M.dpr, chh = c.clientHeight * M.dpr;
      if (c.width !== cw || c.height !== chh) { c.width = cw; c.height = chh; }
      // minimap window: 3 km wide around the ghost
      const scale = c.width / 3000;
      const s = scale / M.k;
      const ox = c.width / 2 - (ghost[0] - M.x0) * scale, oy = c.height / 2 - (ghost[1] - M.y0) * scale;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#9cc6d9'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = true;
      g.drawImage(M.cv, ox, oy, M.cv.width * s, M.cv.height * s);
      g.drawImage(M.fog, ox, oy, M.fog.width * s, M.fog.height * s);
      const P = (x, y) => [ox + (x - M.x0) * scale, oy + (y - M.y0) * scale];
      // view rectangle
      const [vx, vy] = P(cam[0] - viewW / 2, cam[1] - viewH / 2);
      g.strokeStyle = 'rgba(123,92,255,0.8)'; g.lineWidth = 1.5 * M.dpr;
      g.strokeRect(vx, vy, viewW * scale, viewH * scale);
      for (const l of landmarks) {
        const [x, y] = P(l.sx, l.sy);
        if (x < -10 || y < -10 || x > c.width + 10 || y > c.height + 10) continue;
        g.fillStyle = visited.has(l.name) ? '#9aa0a6' : '#ff5a36';
        g.beginPath(); g.arc(x, y, 3.2 * M.dpr, 0, Math.PI * 2); g.fill();
      }
      const [cx, cy] = P(chomper[0], chomper[1]);
      g.fillStyle = '#ffd21f'; g.strokeStyle = '#8a6500'; g.lineWidth = 1.5 * M.dpr;
      g.beginPath(); g.arc(Math.max(4, Math.min(c.width - 4, cx)), Math.max(4, Math.min(c.height - 4, cy)), 4.5 * M.dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      const [gx, gy] = P(ghost[0], ghost[1]);
      g.fillStyle = '#7b5cff'; g.strokeStyle = '#fff';
      g.beginPath(); g.arc(gx, gy, 4.5 * M.dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    },

    // ---------- game over ----------
    showGameOver(r) {
      this.last = r;
      this.show('over', true);
      $('over-score').textContent = r.score.toLocaleString();
      $('over-stats').innerHTML = `<div><b>${r.tasks}</b> tasks</div><div><b>${r.landmarkCount}</b> landmarks</div><div><b>${fmtTime(r.time)}</b> survived</div>`;
      $('over-target').textContent = `You were looking for ${r.target.name}. It's marked on your route map.`;
      const scores = loadScores();
      const qualifies = r.score > 0 && (scores.length < 10 || r.score > scores[scores.length - 1].score);
      this.show('save-row', qualifies);
      $('initials').value = '';
      if (qualifies) setTimeout(() => $('initials').focus(), 50);
      this.renderScores($('over-scores'));
      this.drawRoute(r);
    },
    saveInitials() {
      const r = this.last; if (!r) return;
      const ini = ($('initials').value || '???').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || '???';
      const list = loadScores();
      list.push({ ini, score: r.score, tasks: r.tasks, date: new Date().toISOString().slice(0, 10) });
      list.sort((a, b) => b.score - a.score);
      saveScores(list.slice(0, 10));
      this.show('save-row', false);
      this.renderScores($('over-scores'), ini, r.score);
    },
    renderScores(el, hiIni, hiScore) {
      const list = loadScores();
      if (!list.length) { el.innerHTML = '<div class="muted">No high scores yet.</div>'; return; }
      el.innerHTML = '<table>' + list.map((s, i) => `<tr class="${s.ini === hiIni && s.score === hiScore ? 'me' : ''}"><td>${i + 1}</td><td>${esc(s.ini)}</td><td class="num">${s.score.toLocaleString()}</td><td class="num">${s.tasks} tasks</td></tr>`).join('') + '</table>';
    },
    drawRoute(r) {
      const c = $('route'), g = c.getContext('2d');
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
      const pts = r.route.concat([[r.target.sx, r.target.sy]]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const pad = 300; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const sc = Math.min(c.width / (x1 - x0), c.height / (y1 - y0));
      const ox = (c.width - (x1 - x0) * sc) / 2 - x0 * sc, oy = (c.height - (y1 - y0) * sc) / 2 - y0 * sc;
      g.setTransform(sc, 0, 0, sc, ox, oy);
      g.fillStyle = '#9cc6d9'; g.fillRect(x0 - 1e4, y0 - 1e4, 3e4, 3e4);
      g.fillStyle = '#e9e4da';
      for (const m of r.map.mainland) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.fillStyle = '#f6f2ea';
      for (const m of r.map.islands) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.strokeStyle = '#c9c2b6'; g.lineWidth = 2 / sc * dpr;
      g.beginPath();
      for (const e of r.graph.edgesIn(x0, y0, x1, y1)) { g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); }
      g.stroke();
      g.strokeStyle = '#7b5cff'; g.lineWidth = 4 / sc * dpr; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); r.route.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      const dotAt = (x, y, col, rad) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad / sc * dpr, 0, Math.PI * 2); g.fill(); };
      for (const l of r.landmarks) if (r.visited.has(l.name)) dotAt(l.sx, l.sy, '#ff5a36', 4);
      dotAt(r.target.sx, r.target.sy, '#12a150', 7);
      if (r.route.length) { const [x, y] = r.route[r.route.length - 1]; dotAt(x, y, '#ffd21f', 7); }
    },
  };

  function fmtTime(s) { const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

  PM.UI = UI;
})();
