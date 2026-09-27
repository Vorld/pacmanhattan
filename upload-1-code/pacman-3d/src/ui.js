// DOM overlays: lobby, loading, HUD, Passport, toasts, minimap, pause, place cards, game over, local scores.
(function () {
  const PM = (window.PM = window.PM || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- per-viewer storage (all wrapped: storage can be missing) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* unavailable */ } },
  };
  const scoresKey = (b) => 'pacmanhattan.scores.v2.' + b;
  const stampsKey = (b) => 'pacmanhattan.stamps.v1.' + b;
  PM.store = store;
  PM.loadStamps = (b) => new Set(store.get(stampsKey(b), []));
  PM.saveStamps = (b, set) => store.set(stampsKey(b), [...set]);

  const DIFF_CLASS = { Easy: 'easy', Medium: 'medium', Hard: 'hard' };

  const UI = {
    init(h) {
      this.h = h;
      $('btn-again').onclick = () => h.onAgain();
      $('btn-lobby').onclick = () => h.onLobby();
      $('btn-resume').onclick = () => h.onResume();
      $('btn-menu').onclick = () => h.onLobby();
      $('btn-mute').onclick = () => h.onToggleMute();
      $('btn-save').onclick = () => this.saveInitials();
      $('btn-card').onclick = () => h.onCloseCard();
      $('btn-howto').onclick = () => $('howto').classList.toggle('hidden');
      $('btn-solo').onclick = () => h.onMode(false);
      $('btn-duo').onclick = () => h.onMode(true);
      $('btn-mode-back').onclick = () => this.showLobby();
      $('title').onclick = () => h.onTitle();
      $('btn-rematch').onclick = () => h.onAgain();
      $('btn-vs-lobby').onclick = () => h.onLobby();
      $('passport-toggle').onclick = () => { $('passport').classList.toggle('collapsed'); };
      $('initials').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.saveInitials(); });
      this.mini = $('minimap');
      this.miniCtx = this.mini.getContext('2d');
      this.toastEl = $('toasts');
    },

    show(id, on) { $(id).classList.toggle('hidden', !on); },
    hideAllScreens() { for (const id of ['title', 'lobby', 'modepick', 'loadscreen', 'over', 'vsover', 'pause', 'card']) this.show(id, false); },

    // ---------- lobby ----------
    renderLobby(list) {
      this.lobbyList = list;
      $('boroughs').innerHTML = list.map((b) => {
        const best = (store.get(scoresKey(b.id), [])[0] || {}).score;
        const stamps = PM.loadStamps(b.id).size;
        return `<button class="borough" data-id="${b.id}" id="b-${b.id}">
          <img src="${b.preview}" alt="Map of ${esc(b.name)}">
          <div class="b-body">
            <div class="b-top"><span class="b-name">${esc(b.name)}</span><span class="chip ${DIFF_CLASS[b.difficulty] || ''}">${esc(b.difficulty)}</span></div>
            <div class="b-area">${esc(b.area)}</div>
            <div class="b-stats">
              <span><b>${best ? best.toLocaleString() : '—'}</b> best</span>
              <span><b>${stamps}/${b.landmarks}</b> stamps</span>
              <span><b>${b.targets}</b> places to find</span>
            </div>
          </div>
        </button>`;
      }).join('');
      for (const el of document.querySelectorAll('.borough')) el.onclick = () => this.h.onPick(el.dataset.id);
    },
    showTitle() {
      this.hideAllScreens(); this.show('hud', false); this.show('vs-hud', false);
      this.show('title', true);
    },
    showLobby() {
      this.hideAllScreens(); this.show('hud', false); this.show('vs-hud', false);
      if (this.lobbyList) this.renderLobby(this.lobbyList);
      this.show('lobby', true);
    },
    showModePick(name) {
      this.hideAllScreens();
      $('mode-borough').textContent = name;
      this.show('modepick', true);
      setTimeout(() => $('btn-solo').focus(), 30);
    },
    showLoading(name, p, msg) {
      this.hideAllScreens(); this.show('hud', false); this.show('vs-hud', false); this.show('loadscreen', true);
      $('load-title').textContent = 'Loading ' + name;
      $('load-bar').style.width = Math.round((p || 0) * 100) + '%';
      $('load-msg').textContent = msg || '';
    },

    showHUD(meta) {
      this.hideAllScreens(); this.show('vs-hud', false); this.show('hud', true); this.toastEl.innerHTML = '';
      $('borough-label').textContent = meta.name;
    },
    hideHUD() { this.show('hud', false); },
    showPause(on) { this.show('pause', on); },
    showStartHint(on) { if (this._sh !== on) { this._sh = on; this.show('start-hint', on); } },
    setMuted(m) { $('btn-mute').textContent = m ? '🔇' : '🔊'; },

    setScore(s) { if (this._score !== s) { this._score = s; $('score').textContent = s.toLocaleString(); } },
    setChompers(n) { if (this._cn !== n) { this._cn = n; $('chomper-count').textContent = n === 1 ? '1 chomper' : n + ' chompers'; } },
    setTask(t, cat, icon, n, asRiddle) {
      const riddle = asRiddle && t.riddle;
      $('task-num').textContent = 'Task ' + n;
      $('task-name').textContent = riddle ? '???' : t.name;
      $('task-riddle').textContent = riddle ? t.riddle : '';
      this.show('task-riddle', !!riddle);
      $('task-cat').textContent = icon + ' ' + cat + (riddle ? ' · R to reveal' : '');
      const card = $('task');
      card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    },
    setHints(list) {
      const el = $('hints');
      if (!list.length) { el.innerHTML = '<div class="hint muted">No hints yet. Reach a ★ landmark to get one.</div>'; return; }
      el.innerHTML = list.slice(0, 3).map((h, i) => `<div class="hint ${i ? 'old' : ''}"><b>${esc(h.from)}:</b> ${esc(h.text)}</div>`).join('');
    },

    // street label that follows the ghost
    setHere(text, x, y) {
      const el = $('here');
      if (!text) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      if (this._here !== text) { this._here = text; $('here-text').textContent = text; }
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    },

    // ---------- Passport ----------
    setPassport(items, total, collected) {
      $('passport-count').textContent = `${items.length} this run · ${collected}/${total} collected`;
      const el = $('passport-list');
      if (!items.length) { el.innerHTML = '<div class="muted small pp-empty">Places you reach show up here. Click one to see it again.</div>'; return; }
      el.innerHTML = items.map((it, i) => `<button class="pp-item" data-i="${i}">
        ${it.place.img ? `<img src="${it.place.img}" alt="" loading="lazy" decoding="async">` : `<span class="pp-noimg">${it.kind === 'found' ? '✓' : '★'}</span>`}
        <span class="pp-name">${esc(it.place.name)}</span>
        <span class="pp-tag ${it.kind}">${it.kind === 'found' ? 'Found' : 'Landmark'}</span>
      </button>`).reverse().join('');
      for (const b of el.querySelectorAll('.pp-item')) b.onclick = () => this.h.onRevisit(Number(b.dataset.i));
      $('passport').classList.add('bump'); setTimeout(() => $('passport').classList.remove('bump'), 500);
    },

    // side: 0 or 1 puts the toast on that player's half of the split screen
    toast({ title, body, hint, kind, secs, side }) {
      const box = side === undefined ? this.toastEl : $('vs-toasts-' + side);
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.innerHTML = `<div class="t-title">${esc(title)}</div>${body ? `<div class="t-body">${esc(body)}</div>` : ''}${hint ? `<div class="t-hint">Hint: ${esc(hint)}</div>` : ''}`;
      box.prepend(el);
      while (box.children.length > (side === undefined ? 3 : 2)) box.lastChild.remove();
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, (secs || 5) * 1000);
    },

    // ---------- landmark / target card ----------
    showCard({ kind, place, points, hint, cat, solved, lesson }) {
      const p = place;
      const sv = p.lat ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}` : null;
      const img = p.img
        ? `<figure><img src="${p.img}" alt="${esc(p.name)}" decoding="async"><figcaption>Photo: ${esc(p.credit || 'Wikimedia Commons')}${p.file ? ` · <a href="${esc(p.file)}" target="_blank" rel="noopener">source</a>` : ''}</figcaption></figure>`
        : `<div class="noimg">${esc(p.name)}</div>`;
      const eyebrow = kind === 'found' ? (solved ? 'Riddle solved! +' : 'Found it! +') + points.toLocaleString()
        : kind === 'revisit' ? 'From your Passport' : '★ Landmark +' + points;
      $('card-body').innerHTML = `
        ${img}
        <div class="card-text">
          <div class="eyebrow ${kind}">${eyebrow}</div>
          <h2>${esc(p.name)}</h2>
          ${cat ? `<div class="muted small">${esc(cat)}</div>` : ''}
          <div class="fact"><b>Fun fact:</b> ${esc(p.fact)}</div>
          ${lesson ? `<div class="lesson"><div class="eyebrow">What you just learned</div><p>${esc(lesson.text)}</p>${lesson.image ? `<img src="${esc(lesson.image)}" alt="">` : ''}</div>` : ''}
          ${p.about ? `<p class="about">${esc(p.about)}</p>` : ''}
          ${hint ? `<div class="card-hint"><b>Hint:</b> ${esc(hint)}<div class="small">A green arrow points the way for a few seconds.</div></div>` : ''}
          <div id="card-live" class="card-live" hidden></div>
          <div class="links">
            ${sv ? `<a href="${sv}" target="_blank" rel="noopener">Open Street View ↗</a>` : ''}
            ${p.wiki ? `<a href="${esc(p.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}
          </div>
        </div>`;
      $('btn-card').textContent = kind === 'found' ? 'Next task (Space)' : kind === 'revisit' ? 'Back to running (Space)' : 'Keep running (Space)';
      this.show('card', true);
      setTimeout(() => $('btn-card').focus(), 30);
      this.fillLive(kind, p);
    },

    // live panel from Tiger Data: the buildings around this place, and (for riddles) how other players did
    fillLive(kind, p) {
      if (!PM.Tiger) return;
      const token = (this._liveToken = (this._liveToken || 0) + 1);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const stats = kind === 'found' && p.riddle ? wait(700).then(() => PM.Tiger.riddle(p.name)) : null; // let this find land first
      Promise.all([PM.Tiger.block(p), stats]).then(([blk, rd]) => {
        if (token !== this._liveToken) return;
        const rows = [];
        if (blk && blk.buildings > 0 && blk.typicalYear) {
          const apts = blk.apartments > 0 ? ` Home to ${blk.apartments.toLocaleString()} apartments.` : '';
          const old = blk.oldestYear && blk.oldestYear < blk.typicalYear ? `; the oldest dates to ${blk.oldestYear}` : '';
          rows.push(`<div><b>Know the block${p.ntaname ? ' · ' + esc(p.ntaname) : ''}:</b> ${blk.buildings} buildings within a block or two, typically built around ${blk.typicalYear}${old}.${apts}</div>`);
        }
        if (rd && rd.finds > 0) {
          rows.push(rd.finds === 1
            ? `<div><b>Riddle stats:</b> you're the first player to find this one.</div>`
            : `<div><b>Riddle stats:</b> ${rd.solved} of ${rd.finds} finds solved this riddle before the name appeared${rd.avgSecs ? `, in ${rd.avgSecs} s on average` : ''}.</div>`);
        }
        const el = $('card-live');
        if (!el || !rows.length) return;
        el.innerHTML = rows.join('') + '<div class="card-live-src">Live from Tiger Data: NYC PLUTO buildings and every player\'s riddle attempts</div>';
        el.hidden = false;
      });
    },
    hideCard() { this.show('card', false); },

    // ---------- two-player split screen ----------
    showVersusHUD(meta, players) {
      this.hideAllScreens(); this.show('hud', false); this.show('vs-hud', true);
      $('vs-borough').textContent = meta.name;
      for (const p of players) {
        const el = $('vs-side-' + p.i);
        el.style.setProperty('--pc', p.color);
        el.querySelector('.vs-name').textContent = p.name;
        el.querySelector('.vs-keys').textContent = p.keys;
        $('vs-toasts-' + p.i).innerHTML = '';
        $('vs-pp-' + p.i).style.setProperty('--pc', p.color);
        this.setVersusPlayer(p);
        this.setVersusPassport(p.i, p.passport);
      }
      this.hideVersusCards();
      this._vsStreet = [];
      this._vsCount = null;
    },
    setVersusPlayer(p) {
      const el = $('vs-side-' + p.i);
      el.querySelector('.vs-found').textContent = p.found;
      el.classList.toggle('out', !p.alive);
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    },
    setVersusTask(t, cat, icon, n) {
      $('vs-num').textContent = 'target ' + n;
      $('vs-task-name').textContent = t.name;
      $('vs-task-cat').textContent = icon + ' ' + cat;
      const card = $('vs-task');
      card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    },
    // every hint for the current target stays listed, newest first
    setVersusHints(i, list) {
      const el = $('vs-side-' + i).querySelector('.vs-hints');
      el.innerHTML = list.length ? list.map((h, k) => `<div class="hint ${k ? 'old' : ''}"><b>${esc(h.from)}:</b> ${esc(h.text)}</div>`).join('')
        : '<div class="hint muted">Reach a ★ landmark for a hint.</div>';
    },
    // one player's own Passport: the landmarks and targets they reached, newest first
    setVersusPassport(i, items) {
      const box = $('vs-pp-' + i);
      const n = items.filter((it) => it.kind === 'found').length;
      box.querySelector('.vs-pp-count').textContent = `${n} found · ${items.length - n} landmark${items.length - n === 1 ? '' : 's'}`;
      const el = box.querySelector('.vs-pp-list');
      el.innerHTML = items.length ? items.map((it) => `<div class="pp-item" title="${esc(it.place.name)}">
          ${it.place.img ? `<img src="${it.place.img}" alt="" loading="lazy" decoding="async">` : `<span class="pp-noimg">${it.kind === 'found' ? '✓' : '★'}</span>`}
          <span class="pp-name">${esc(it.place.name)}</span>
          <span class="pp-tag ${it.kind}">${it.kind === 'found' ? 'Found' : 'Landmark'}</span>
        </div>`).reverse().join('')
        : '<div class="muted small pp-empty">Places you reach show up here.</div>';
      if (items.length) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
    },
    setVersusStreet(i, text) {
      if (this._vsStreet[i] === text) return;
      this._vsStreet[i] = text;
      $('vs-side-' + i).querySelector('.vs-street').textContent = text ? '📍 ' + text : '';
    },
    setVersusCountdown(secs) {
      const label = secs > 0 ? String(Math.ceil(secs)) : '';
      if (this._vsCount === label) return;
      this._vsCount = label;
      $('vs-count').textContent = label;
      this.show('vs-count', !!label);
    },
    // the place just found, shown on both halves; each player readies up with their own keys
    showVersusCards({ place: p, cat, icon, finder, players, ready }) {
      for (const q of players) {
        const mine = q === finder;
        const img = p.img
          ? `<figure><img src="${p.img}" alt="${esc(p.name)}" decoding="async"><figcaption>Photo: ${esc(p.credit || 'Wikimedia Commons')}${p.file ? ` · <a href="${esc(p.file)}" target="_blank" rel="noopener">source</a>` : ''}</figcaption></figure>`
          : `<div class="noimg">${esc(p.name)}</div>`;
        const el = $('vs-card-' + q.i);
        el.style.setProperty('--pc', finder.color);
        el.innerHTML = `${img}
          <div class="card-text">
            <div class="eyebrow vs-finder">${mine ? 'You found it first!' : esc(finder.name) + ' found it first'}</div>
            <h2>${esc(p.name)}</h2>
            <div class="muted small">${icon} ${esc(cat)}</div>
            <div class="fact"><b>Fun fact:</b> ${esc(p.fact)}</div>
            ${p.about ? `<p class="about">${esc(p.about)}</p>` : ''}
            ${p.wiki ? `<div class="links"><a href="${esc(p.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a></div>` : ''}
          </div>
          <div class="vs-ready" style="--rc:${q.color}"></div>`;
        el.classList.remove('hidden');
      }
      $('vs-hud').classList.add('carding');
      this._vsPlayers = players;
      this.setVersusReady(ready);
    },
    setVersusReady(ready) {
      for (const q of this._vsPlayers) {
        const r = $('vs-card-' + q.i).querySelector('.vs-ready');
        const other = this._vsPlayers[1 - q.i];
        r.classList.toggle('done', ready[q.i]);
        r.textContent = !q.alive ? "You're out, but you can still read along."
          : !ready[q.i] ? `${q.name}: press ${q.i ? 'an arrow key' : 'W, A, S or D'} when you're ready`
          : ready[other.i] ? 'Both ready!' : `Ready! Waiting for ${other.name}…`;
      }
    },
    hideVersusCards() {
      for (const i of [0, 1]) this.show('vs-card-' + i, false);
      $('vs-hud').classList.remove('carding');
    },

    showVersusOver({ boroughName, players, winner, reason, time }) {
      this.hideVersusCards();
      this.show('vs-hud', false);
      this.hideAllScreens();
      $('vso-borough').textContent = boroughName;
      $('vso-title').textContent = winner ? winner.name + ' wins!' : "It's a tie!";
      $('vso-title').style.color = winner ? winner.color : '';
      $('vso-reason').textContent = reason;
      $('vso-grid').innerHTML = players.map((p) => `<div class="vso-p ${p === winner ? 'win' : ''}" style="--pc:${p.color}">
        <div class="vs-who"><span class="vs-dot"></span><span>${esc(p.name)}</span></div>
        <div class="big">${p.found}</div>
        <div class="small muted">target${p.found === 1 ? '' : 's'} · ${p.alive ? 'still running' : 'out at ' + fmtTime(p.diedAt)}</div>
      </div>`).join('');
      this.show('vsover', true);
      setTimeout(() => $('btn-rematch').focus(), 30);
    },

    // ---------- minimap ----------
    resetMini() { this.miniData = null; },
    buildMini(graph, map) {
      const S = 0.075;
      const dpr = Math.min(2, devicePixelRatio || 1);
      let [x0, y0, x1, y1] = map.meta.bounds;
      x0 -= 600; y0 -= 600; x1 += 600; y1 += 600;
      const k = S * dpr;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((x1 - x0) * k); cv.height = Math.ceil((y1 - y0) * k);
      const g = cv.getContext('2d');
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      g.fillStyle = '#9fd3ea'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = '#e2dbd0';
      for (const m of map.mainland) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.fillStyle = '#f7f3ec';
      for (const m of map.islands) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.strokeStyle = '#9a93a8'; g.lineWidth = 9;
      g.beginPath();
      for (const e of graph.edges) { g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); }
      g.stroke();
      const fog = document.createElement('canvas');
      fog.width = cv.width; fog.height = cv.height;
      const fg = fog.getContext('2d');
      fg.fillStyle = 'rgba(52,44,86,0.8)'; fg.fillRect(0, 0, fog.width, fog.height);
      this.miniData = { cv, fog, fg, x0, y0, k, dpr, revealed: new Set() };
    },

    drawMinimap({ graph, map, fog, ghost, chompers, landmarks, visited, cam, viewW, viewH, trail }) {
      if (!this.miniData) this.buildMini(graph, map);
      const M = this.miniData, c = this.mini, g = this.miniCtx;
      if (fog.size < M.revealed.size) {
        M.fg.globalCompositeOperation = 'source-over';
        M.fg.clearRect(0, 0, M.fog.width, M.fog.height);
        M.fg.fillStyle = 'rgba(52,44,86,0.8)'; M.fg.fillRect(0, 0, M.fog.width, M.fog.height);
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
      const scale = c.width / 3000;
      const s = scale / M.k;
      const ox = c.width / 2 - (ghost[0] - M.x0) * scale, oy = c.height / 2 - (ghost[1] - M.y0) * scale;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#9fd3ea'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(M.cv, ox, oy, M.cv.width * s, M.cv.height * s);
      g.drawImage(M.fog, ox, oy, M.fog.width * s, M.fog.height * s);
      const P = (x, y) => [ox + (x - M.x0) * scale, oy + (y - M.y0) * scale];
      if (trail && trail.length > 1) {
        g.strokeStyle = 'rgba(143,116,255,0.9)'; g.lineWidth = 2 * M.dpr; g.lineJoin = 'round';
        g.beginPath(); trail.forEach((p, i) => { const [x, y] = P(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      }
      const [vx, vy] = P(cam[0] - viewW / 2, cam[1] - viewH / 2);
      g.strokeStyle = 'rgba(143,116,255,0.7)'; g.lineWidth = 1.5 * M.dpr;
      g.strokeRect(vx, vy, viewW * scale, viewH * scale);
      for (const l of landmarks) {
        const [x, y] = P(l.sx, l.sy);
        if (x < -10 || y < -10 || x > c.width + 10 || y > c.height + 10) continue;
        g.fillStyle = visited.has(l.name) ? '#a7a3b5' : '#ff6b4a';
        g.beginPath(); g.arc(x, y, 3.2 * M.dpr, 0, Math.PI * 2); g.fill();
      }
      for (const ch of chompers) {
        const [cx, cy] = P(ch.p[0], ch.p[1]);
        g.fillStyle = ch.color; g.strokeStyle = '#2a2140'; g.lineWidth = 1.5 * M.dpr;
        g.beginPath(); g.arc(Math.max(5, Math.min(c.width - 5, cx)), Math.max(5, Math.min(c.height - 5, cy)), 4.5 * M.dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      const [gx, gy] = P(ghost[0], ghost[1]);
      g.fillStyle = '#8f74ff'; g.strokeStyle = '#fff'; g.lineWidth = 2 * M.dpr;
      g.beginPath(); g.arc(gx, gy, 5 * M.dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    },

    // ---------- game over ----------
    showGameOver(r) {
      this.last = r;
      this.show('over', true);
      $('over-borough').textContent = r.boroughName;
      $('over-score').textContent = r.score.toLocaleString();
      $('over-stats').innerHTML = `<div><b>${r.tasks}</b> tasks</div><div><b>${r.landmarkCount}</b> landmarks</div><div><b>${fmtTime(r.time)}</b> survived</div>`;
      $('over-target').textContent = `You were looking for ${r.target.name}. It's the green dot on your route map.`;
      const scores = store.get(scoresKey(r.borough), []);
      const qualifies = r.score > 0 && (scores.length < 10 || r.score > scores[scores.length - 1].score);
      this.show('save-row', qualifies);
      $('initials').value = '';
      if (qualifies) setTimeout(() => $('initials').focus(), 50);
      this.globalTop = null; this._saved = false;
      this.renderScores($('over-scores'), r.borough);
      // the shared top 10 from MongoDB replaces this browser's list once it arrives
      PM.Cloud.scores(r.borough).then((g) => {
        if (!g || this.last !== r) return;
        this.globalTop = g.top;
        const top = g.top;
        if (!this._saved && r.score > 0 && (top.length < 10 || r.score > top[top.length - 1].score) && $('save-row').classList.contains('hidden')) {
          this.show('save-row', true);
          setTimeout(() => $('initials').focus(), 50);
        }
        if (!this._saved) this.renderScores($('over-scores'), r.borough);
      });
      this.drawRoute(r);
    },
    saveInitials() {
      const r = this.last; if (!r) return;
      const ini = ($('initials').value || '???').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || '???';
      const list = store.get(scoresKey(r.borough), []);
      list.push({ ini, score: r.score, tasks: r.tasks, date: new Date().toISOString().slice(0, 10) });
      list.sort((a, b) => b.score - a.score);
      store.set(scoresKey(r.borough), list.slice(0, 10));
      this.show('save-row', false);
      this._saved = true;
      this.renderScores($('over-scores'), r.borough, ini, r.score);
      PM.Cloud.submitScore({ initials: ini, borough: r.borough, score: r.score, tasks: r.tasks, landmarks: r.landmarkCount, time: Math.round(r.time) })
        .then((res) => {
          if (!res || this.last !== r) return;
          this.globalTop = res.top;
          this.renderScores($('over-scores'), r.borough, ini, r.score);
          $('scores-title').textContent = `High scores · everyone · you're #${res.rank}`;
        });
    },
    // the shared list from MongoDB when we have it, otherwise this browser's
    renderScores(el, borough, hiIni, hiScore) {
      const list = this.globalTop || store.get(scoresKey(borough), []);
      $('scores-title').textContent = this.globalTop ? 'High scores · everyone' : 'High scores';
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
      g.fillStyle = '#9fd3ea'; g.fillRect(x0 - 1e4, y0 - 1e4, 3e4, 3e4);
      g.fillStyle = '#e2dbd0';
      for (const m of r.map.mainland) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.fillStyle = '#f7f3ec';
      for (const m of r.map.islands) { g.beginPath(); m.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); }
      g.strokeStyle = '#cfc6d9'; g.lineWidth = 2 / sc * dpr;
      g.beginPath();
      for (const e of r.graph.edgesIn(x0, y0, x1, y1)) { g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); }
      g.stroke();
      g.strokeStyle = '#8f74ff'; g.lineWidth = 4 / sc * dpr; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); r.route.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      const dotAt = (x, y, col, rad) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad / sc * dpr, 0, Math.PI * 2); g.fill(); };
      for (const l of r.landmarks) if (r.visited.has(l.name)) dotAt(l.sx, l.sy, '#ff6b4a', 4);
      dotAt(r.target.sx, r.target.sy, '#19b86a', 7);
      if (r.route.length) { const [x, y] = r.route[r.route.length - 1]; dotAt(x, y, '#ffd21f', 7); }
    },
  };

  function fmtTime(s) { const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

  PM.UI = UI;
})();
