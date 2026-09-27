// Pac-Manhattan: lobby, borough loading, and the core game loop (3D).
(function () {
  const PM = window.PM;

  // ---------- tuning ----------
  const CFG = {
    ghostSpeed: 82,           // metres per game-second
    ferrySpeed: 5,            // x ghost speed while riding the Staten Island Ferry (chompers can't board)
    chomperBase: 0.80,        // x ghost speed at run start
    chomperPerTask: 0.045,    // added per completed task
    chomperPerSec: 0.0012,    // added per second within a task
    chomperTimeCap: 0.10,
    chomperMax: 1.2,
    maxChompers: 3,
    catchDist: 18,
    arriveDist: 45,
    spawnMin: 1000, spawnMax: 2000,  // chomper spawn path distance (m)
    spawnGrace: 1.6,                 // seconds a new chomper waits before moving
    hintArrowSecs: 12,
    cursorDeadZone: 30,
    trailSecs: 45,
    taskBase: 1000, hintCost: 100, taskFloor: 400, streakBonus: 250, landmarkPts: 100,
    revealSecs: 30,           // a task starts as a riddle; its name shows after this long, at a ★ landmark, or on R
    riddleBonus: 1.5,         // x points for finding it before the name shows
  };
  const KINDS = [
    { kind: 'chaser', name: 'Chomps', color: '#ffd21f', desc: 'It chases you straight down the streets.' },
    { kind: 'ambusher', name: 'Sneaky', color: '#ff8fb1', desc: 'It cuts you off on the way to your target.' },
    { kind: 'wanderer', name: 'Snooze', color: '#6fd6c0', desc: 'It wanders around and pounces when you get close.' },
  ];
  const CAT = { R: 'Famous restaurant', M: 'Museum & culture', P: 'Park & public space', L: 'Monument & landmark' };
  const CAT_ICON = { R: '🍴', M: '🏛', P: '🌳', L: '🗽' };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  const canvas = document.getElementById('game');
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const renderer = PM.World3D.makeRenderer(canvas);
  const audio = new PM.Audio();
  const ui = PM.UI;
  const voice = PM.voice;
  let LESSONS = { places: {}, edges: {} };
  fetch('data/lessons.json').then((r) => r.ok ? r.json() : null).then((j) => { if (j) LESSONS = j; }).catch(() => {});
  const lessonFor = (name) => (LESSONS.places || {})[name] || null;
  const muteAll = () => { const m = audio.toggleMute(); voice.setMuted(m); ui.setMuted(m); };

  let B = null; // the loaded borough: data, graph, world, 3D objects, places
  const cache = {};

  let W = 0, H = 0;
  function resize() {
    W = Math.floor(innerWidth * DPR); H = Math.floor(innerHeight * DPR);
    renderer.setSize(innerWidth, innerHeight, false);
    if (B) { B.world.camera.aspect = innerWidth / innerHeight; B.world.camera.updateProjectionMatrix(); B.world.w = W; B.world.h = H; sizeVersusCams(); }
    fx.width = W; fx.height = H;
    fx.style.width = innerWidth + 'px'; fx.style.height = innerHeight + 'px';
  }
  addEventListener('resize', resize);
  resize();

  // ---------- borough loading ----------
  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' returned ' + r.status);
    return r.json();
  }

  // load a borough's data and build its 3D world (reused if it's already loaded)
  async function ensureBorough(id, progress = () => {}) {
    if (B && B.id !== id) { B.world.dispose(); B = null; demo = null; }
    if (!B) {
      let raw = cache[id];
      if (!raw) {
        let done = 0;
        const step = (p) => p.then((v) => { done++; progress(done); return v; });
        const [map, gdata, places] = await Promise.all([
          step(fetchJSON(`data/${id}/map.json`)), step(fetchJSON(`data/${id}/graph.json`)), step(fetchJSON(`data/${id}/places.json`)),
        ]);
        raw = cache[id] = { map, gdata, places };
      }
      const map = raw.map;
      if (map.q) {
        const k = 1 / map.q;
        for (const key of ['green', 'water', 'buildings']) map[key] = map[key].map((p) => Float32Array.from(p, (v) => v * k));
        map.q = 0;
      }
      const graph = new PM.Graph(raw.gdata);
      const world = new PM.World3D(renderer, map, graph);
      world.camera.aspect = innerWidth / innerHeight; world.camera.updateProjectionMatrix();
      world.w = W; world.h = H;
      const snap = (list) => list.map((p) => {
        const s = graph.nearest(p.x, p.y, 800);
        return s && s.d < 300 ? { ...p, pos: { e: s.e, s: s.s }, sx: s.x, sy: s.y } : null;
      }).filter(Boolean);
      const LANDMARKS = snap(raw.places.landmarks), TARGETS = snap(raw.places.targets);
      world.addLandmarks(LANDMARKS);
      B = {
        id, meta: map.meta, map, graph, world, LANDMARKS, TARGETS,
        ghost3d: new PM.Ghost3D(world.scene),
        chompers3d: KINDS.map((k) => new PM.Chomper3D(world.scene, k.color)),
        bubble: new PM.Bubble3D(world.scene),
        trail: new PM.Trail3D(world.scene, '#8f74ff', CFG.trailSecs),
        arrow: new PM.HintArrow3D(world.scene),
      };
      ui.resetMini();
    }
    return B;
  }

  async function loadBorough(id) {
    const info = lobby.find((b) => b.id === id);
    state.mode = 'loading';
    demo = null;
    ui.showLoading(info.name, 0.05, 'Downloading the map…');
    if (demoLoad) await demoLoad.catch(() => {}); // don't race the title screen's Manhattan
    await ensureBorough(id, (done) => ui.showLoading(info.name, 0.05 + done * 0.15, 'Downloading the map…'));
    // build the city around the start before the run begins
    const start = startPlace();
    B.loadFocus = [start.sx, start.sy];
    state.mode = 'building';
  }

  // a ghost parked on the street node nearest a place
  function newGhost(place) {
    const g = { e: place.pos.e, s: place.pos.s, dir: 1, moving: false, started: false, anim: 0, inp: newInput() };
    if (g.s < g.e.len / 2) { g.node = g.e.a; g.s = 0; } else { g.node = g.e.b; g.s = g.e.len; }
    return g;
  }

  function startPlace() {
    return B.LANDMARKS.find((l) => l.name === B.meta.start) || B.LANDMARKS[0];
  }

  // ---------- input ----------
  // each ghost has its own input: keys held, and the last key pressed (a turn queued for the next corner)
  const newInput = () => ({ held: new Set(), queued: null, queuedAt: 0 });
  const clearInput = (g) => { if (g) { g.inp.held.clear(); g.inp.queued = null; } };
  let mouse = null, mouseActive = false;
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const P1KEYS = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  const P2KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  // which ghost a key steers, and which way: [ghost, dir], or null
  function keyTarget(code) {
    if (state.versus) {
      if (!state.players) return null;
      if (P1KEYS[code]) return [state.players[0].g, P1KEYS[code]];
      if (P2KEYS[code]) return [state.players[1].g, P2KEYS[code]];
      return null;
    }
    return KEYMAP[code] && state.ghost ? [state.ghost, KEYMAP[code]] : null;
  }
  addEventListener('keydown', (ev) => {
    if (state.mode === 'title') {
      if (!ev.metaKey && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); leaveTitle(); }
      return;
    }
    if (state.mode === 'card') {
      if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'Escape') { ev.preventDefault(); closeCard(); }
      return;
    }
    const hit = keyTarget(ev.code);
    if (hit && state.mode === 'vscard') {
      ev.preventDefault();
      if (!ev.repeat) versusReady(state.players.findIndex((p) => p.g === hit[0]));
      return;
    }
    if (hit) {
      if (state.mode !== 'play') return;
      ev.preventDefault();
      const [g, d] = hit;
      g.inp.held.add(d); g.inp.queued = d; g.inp.queuedAt = now; mouseActive = false;
      audio.unlock();
      if (!state.versus && !g.started) g.started = true;
      return;
    }
    if ((ev.code === 'KeyP' || ev.code === 'Escape') && (state.mode === 'play' || state.mode === 'pause')) togglePause();
    if (ev.code === 'KeyR' && state.mode === 'play' && !state.versus) reveal();
    if (ev.code === 'KeyM') muteAll();
  });
  addEventListener('keyup', (ev) => { const hit = keyTarget(ev.code); if (hit) hit[0].inp.held.delete(hit[1]); });
  addEventListener('blur', () => {
    clearInput(state.ghost);
    if (state.players) state.players.forEach((p) => clearInput(p.g));
    if (state.mode === 'play') togglePause();
  });
  const onPointer = (ev) => {
    mouse = [ev.clientX, ev.clientY];
    if (state.mode === 'play' && !state.versus) mouseActive = true;
  };
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerdown', (ev) => { onPointer(ev); if (state.mode === 'play' && !state.versus && !state.ghost.started) { state.ghost.started = true; audio.unlock(); } });

  function wanted(g) {
    const { held, queued, queuedAt } = g.inp;
    for (const d of ['up', 'down', 'left', 'right']) if (held.has(d)) return { v: DIRS[d], key: d };
    if (queued && now - queuedAt < 1.6) return { v: DIRS[queued], key: queued };
    if (mouseActive && mouse && g === state.ghost && !state.versus) {
      const p = B.world.groundAt(mouse[0], mouse[1]);
      if (p) {
        const g = posXY(state.ghost);
        const dx = p[0] - g[0], dy = p[1] - g[1], L = Math.hypot(dx, dy);
        state.cursorWorld = p;
        if (L > CFG.cursorDeadZone) return { v: [dx / L, dy / L], cursor: true };
      }
    }
    return null;
  }

  // ---------- movement ----------
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const posXY = (m) => B.graph.pointAt(m.e, m.s);

  function moveGhost(g, dist) {
    const graph = B.graph;
    const inp = g.inp;
    const want = wanted(g);
    const wv = want && want.v;
    const turnDot = want && want.cursor ? 0.25 : 0.62;
    if (wv && g.moving) {
      const h = graph.headingAt(g.e, g.s, g.dir);
      if (dot(h, wv) < (want.cursor ? -0.35 : -0.6)) { g.dir = -g.dir; if (!want.cursor) inp.queued = null; }
    }
    let guard = 0;
    while (dist > 1e-6 && guard++ < 20) {
      if (!g.moving) {
        if (!wv) return;
        const pick = chooseEdge(g.node, null, wv, turnDot);
        if (!pick) return;
        enterEdge(g, pick, g.node);
        g.moving = true; if (!want.cursor) inp.queued = null;
        continue;
      }
      const remain = g.dir > 0 ? g.e.len - g.s : g.s;
      if (dist < remain) { g.s += dist * g.dir; return; }
      dist -= remain;
      const node = g.dir > 0 ? g.e.b : g.e.a;
      g.s = g.dir > 0 ? g.e.len : 0;
      const heading = graph.headingAt(g.e, g.s, g.dir);
      let pick = wv ? chooseEdge(node, g.e, wv, turnDot) : null;
      if (pick && want.key && want.key === inp.queued && !inp.held.has(want.key)) inp.queued = null;
      if (!pick) pick = chooseEdge(node, g.e, heading, 0.5);
      if (!pick) { g.moving = false; g.node = node; return; }
      enterEdge(g, pick, node);
    }
  }

  function chooseEdge(node, cameFrom, vec, minDot = 0.62) {
    const graph = B.graph;
    let best = null, bd = minDot;
    for (const e of graph.adj[node]) {
      if (e === cameFrom && graph.adj[node].length > 1) continue;
      const d = dot(graph.outHeading(e, node), vec);
      if (d > bd) { bd = d; best = e; }
    }
    return best;
  }

  function enterEdge(m, e, fromNode) {
    m.e = e;
    if (e.a === fromNode) { m.s = 0; m.dir = 1; } else { m.s = e.len; m.dir = -1; }
  }

  function moveChomper(c, dist, target) {
    const graph = B.graph;
    let guard = 0;
    while (dist > 1e-6 && guard++ < 30) {
      if (c.e === target.e && !c.path.length) {
        const d = target.s - c.s;
        c.s += Math.sign(d) * Math.min(Math.abs(d), dist); c.dir = Math.sign(d) || c.dir;
        return;
      }
      if (!c.path.length) return;
      const next = c.path[0];
      const endNode = c.dir > 0 ? c.e.b : c.e.a;
      if (endNode !== next) {
        if ((c.dir > 0 ? c.e.a : c.e.b) === next) c.dir = -c.dir;
        else { c.path = []; return; }
      }
      const remain = c.dir > 0 ? c.e.len - c.s : c.s;
      if (dist < remain) { c.s += dist * c.dir; return; }
      dist -= remain;
      c.path.shift();
      if (c.path.length) {
        const e = graph.edgeBetween(next, c.path[0]);
        if (!e) { c.path = []; return; }
        enterEdge(c, e, next);
      } else if ((target.e.a === next || target.e.b === next) && target.e.cls !== 4) { // chompers wait at the ferry terminal
        enterEdge(c, target.e, next);
      } else return;
    }
  }

  const nodePos = (n) => { const e = B.graph.adj[n][0]; return { e, s: e.a === n ? 0 : e.len }; };

  // where each chomper is heading this moment, by personality
  function chomperGoal(c, g, gp, cp) {
    const d = Math.hypot(cp[0] - gp[0], cp[1] - gp[1]);
    if (c.kind === 'chaser') return { pos: g, mode: 'chase' };
    if (c.kind === 'ambusher') {
      if (d < 220 || !state.route || !state.route.length) return { pos: g, mode: 'chase' };
      // a node ~350 m ahead of the ghost on its likely route to the target
      const graph = B.graph;
      let acc = 0, prev = gp, pick = state.route[state.route.length - 1];
      for (const n of state.route) {
        const q = [graph.nx[n], graph.ny[n]];
        acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q;
        if (acc >= 350) { pick = n; break; }
      }
      return { pos: nodePos(pick), mode: 'cutoff' };
    }
    // wanderer
    if (c.mode === 'chase' ? d < 800 : d < 420) return { pos: g, mode: 'chase' };
    if (c.roam == null || c.roamT > 14) {
      const graph = B.graph, n = graph.nx.length;
      for (let i = 0; i < 30; i++) {
        const k = Math.floor(Math.random() * n);
        if (Math.hypot(graph.nx[k] - gp[0], graph.ny[k] - gp[1]) < 1500) { c.roam = k; break; }
      }
      c.roamT = 0;
    }
    const rp = [B.graph.nx[c.roam], B.graph.ny[c.roam]];
    if (Math.hypot(rp[0] - cp[0], rp[1] - cp[1]) < 30) c.roamT = 99;
    return { pos: nodePos(c.roam), mode: 'roam' };
  }

  // ---------- run state ----------
  let now = 0;
  const state = { mode: 'title', chompers: [] };

  function startRun() {
    const start = startPlace();
    Object.assign(state, {
      mode: 'play', versus: false, players: null, time: 0, score: 0, tasksDone: 0, taskTime: 0,
      visited: new Set([start.name]), used: new Set(), recentCats: [], route: null, route_pts: [], routeTimer: 0,
      hint: null, fog: new Set(), cursorWorld: null, chompers: [], passport: [], routeAt: -9, afterCard: null,
    });
    state.stamps = PM.loadStamps(B.id);
    B.world.resetMarkers();
    B.world.setVisited(start.name);
    B.trail.reset();
    const g = (state.ghost = newGhost(start));
    mouseActive = false; camPos = null;
    showSoloModels(true);
    newTask(true);
    addChomper();
    ui.showHUD(B.meta);
    ui.setPassport([], B.LANDMARKS.length, state.stamps.size);
    ui.setChompers(1);
    ui.toast({ title: 'You are the ghost', body: (state.revealed ? 'Find ' + state.task.name + '.' : 'Solve the riddle in your task card. Find it before the name shows for +50%.') + ' It glows gold when you get close. Visit ★ landmarks for hints.', kind: 'info', secs: 7 });
    audio.start();
    voice.play(state.revealed ? 'start-plain' : 'start');
  }

  function newTask(first) {
    const g = posXY(state.ghost);
    const m = B.meta;
    const far = (t, lo, hi) => { const d = Math.hypot(t.sx - g[0], t.sy - g[1]); return d >= lo && d <= hi; };
    const pool = B.TARGETS.filter((t) => !state.used.has(t.name) && !state.recentCats.includes(t.cat));
    let cands = pool.filter((t) => far(t, m.task_min, first ? m.first_max : m.task_max));
    if (!cands.length) cands = pool.filter((t) => far(t, m.task_min * 0.6, Infinity));
    if (!cands.length) cands = B.TARGETS.filter((t) => !state.used.has(t.name) && far(t, 300, Infinity));
    if (!cands.length) { state.used.clear(); cands = B.TARGETS.filter((t) => far(t, 300, Infinity)); }
    const t = cands[Math.floor(Math.random() * cands.length)];
    state.task = t;
    state.used.add(t.name);
    state.recentCats.push(t.cat);
    if (state.recentCats.length > 2) state.recentCats.shift();
    state.taskHints = 0; state.taskTime = 0; state.hint = null; state.hintLog = []; state.route = null; state.routeAt = -9;
    B.world.setTarget(t);
    state.revealed = !t.riddle;
    ui.setTask(t, CAT[t.cat], CAT_ICON[t.cat], state.tasksDone + 1, !state.revealed);
    ui.setHints([]);
  }

  // pick far-away spawn points: not near the ghost(s), the target, or each other
  function spawnPoints(count, from = [state.ghost]) {
    const graph = B.graph;
    let dist = graph.distancesFrom(from[0], CFG.spawnMax * 1.6, { noFerry: true });
    for (const f of from.slice(1)) {
      const d2 = graph.distancesFrom(f, CFG.spawnMax * 1.6, { noFerry: true });
      dist = dist.map((v, i) => Math.min(v, d2[i]));
    }
    const t = state.task;
    const picks = [];
    for (let relax = 0; relax < 4 && picks.length < count; relax++) {
      const lo = CFG.spawnMin * (1 - relax * 0.25), hi = CFG.spawnMax * (1 + relax * 0.3);
      const cands = [];
      for (let i = 0; i < dist.length; i++) {
        if (dist[i] < lo || dist[i] > hi) continue;
        if (Math.hypot(graph.nx[i] - t.sx, graph.ny[i] - t.sy) < 600 - relax * 150) continue;
        cands.push(i);
      }
      for (let k = 0; k < 60 && picks.length < count && cands.length; k++) {
        const n = cands[Math.floor(Math.random() * cands.length)];
        if (picks.every((p) => Math.hypot(graph.nx[p] - graph.nx[n], graph.ny[p] - graph.ny[n]) > 450)) picks.push(n);
      }
    }
    while (picks.length < count) {
      let bi = 0; for (let i = 0; i < dist.length; i++) if (isFinite(dist[i]) && dist[i] > (isFinite(dist[bi]) ? dist[bi] : -1)) bi = i;
      picks.push(bi);
    }
    return picks;
  }

  function placeChomper(c, n) {
    const e = B.graph.adj[n][0];
    Object.assign(c, { e, s: e.a === n ? 0 : e.len, dir: 1, path: [], repath: 0, spawnFx: CFG.spawnGrace, mode: 'roam', roam: null, roamT: 0 });
  }

  function addChomper(from) {
    const k = KINDS[state.chompers.length];
    const c = { ...k, mouth: 0 };
    placeChomper(c, spawnPoints(1, from)[0]);
    state.chompers.push(c);
    return c;
  }

  function respawnAll(from) {
    const pts = spawnPoints(state.chompers.length, from);
    state.chompers.forEach((c, i) => placeChomper(c, pts[i]));
  }

  function chomperFactor(c) {
    const t = Math.min(CFG.chomperTimeCap, state.taskTime * CFG.chomperPerSec);
    let f = Math.min(CFG.chomperMax, CFG.chomperBase + CFG.chomperPerTask * state.tasksDone + t) * (B.meta.speed || 1);
    if (c.kind === 'ambusher') f *= 0.96;
    if (c.kind === 'wanderer') f *= c.mode === 'chase' ? 1.02 : 0.72;
    return f;
  }

  function togglePause() {
    if (state.mode === 'play') { state.mode = 'pause'; ui.showPause(true); audio.pause(true); }
    else if (state.mode === 'pause') { state.mode = 'play'; ui.showPause(false); audio.pause(false); last = performance.now(); }
  }

  function openCard(info) {
    state.mode = 'card';
    clearInput(state.ghost);
    audio.pause(true);
    ui.showCard(info);
  }
  function closeCard() {
    if (state.mode !== 'card') return;
    ui.hideCard();
    state.mode = 'play';
    last = performance.now();
    audio.pause(false);
    if (state.afterCard) { const f = state.afterCard; state.afterCard = null; f(); }
  }

  function describeDir(dx, dy) {
    const grid = B.meta.grid_words;
    const ns = dy < 0 ? (grid ? 'uptown' : 'north') : (grid ? 'downtown' : 'south');
    const ew = dx > 0 ? 'east' : 'west';
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < ay * 0.35) return ns;
    if (ay < ax * 0.35) return 'to the ' + ew;
    return grid ? ns + ' & ' + ew : ns + ew;
  }

  // show the task's real name (riddle mode)
  function reveal() {
    if (state.revealed || state.versus) return;
    state.revealed = true;
    const t = state.task;
    ui.setTask(t, CAT[t.cat], CAT_ICON[t.cat], state.tasksDone + 1, false);
    if (t.riddle) PM.Tiger.event(B.id, t.name, 'revealed', state.taskTime);
  }

  function giveHint(landmark) {
    reveal();
    const t = state.task;
    const p = B.graph.path(state.ghost, t.pos);
    const miles = (p ? p.dist : Math.hypot(t.sx - landmark.sx, t.sy - landmark.sy)) / 1609.34;
    const txt = `${t.name} is ${miles < 0.1 ? 'under 0.1' : miles.toFixed(1)} mi away, ${describeDir(t.sx - landmark.sx, t.sy - landmark.sy)}.`;
    state.taskHints++;
    state.hint = { until: state.time + CFG.hintArrowSecs };
    state.hintLog.unshift({ from: landmark.name, text: txt });
    ui.setHints(state.hintLog);
    return txt;
  }

  const taskPoints = () => Math.max(CFG.taskFloor, CFG.taskBase - CFG.hintCost * state.taskHints) + CFG.streakBonus * state.tasksDone;

  function addToPassport(kind, place) {
    state.passport.push({ kind, place });
    if (kind === 'landmark') { state.stamps.add(place.name); PM.saveStamps(B.id, state.stamps); PM.Cloud.addStamps(B.id, [place.name]); }
    ui.setPassport(state.passport, B.LANDMARKS.length, state.stamps.size);
  }

  function gameOver() {
    state.mode = 'over';
    audio.chomp(); audio.stop();
    if (!state.versus) voice.play('chomped');
    if (!state.versus && state.task) PM.Tiger.event(B.id, state.task.name, 'caught', state.taskTime);
    PM.Cloud.saveRun({ mode: 'solo', borough: B.id, score: state.score, tasks: state.tasksDone, time: Math.round(state.time),
      passport: state.passport.map((it) => ({ kind: it.kind, name: it.place.name })) });
    if (!state.versus) sendPostcard();
    ui.hideHUD();
    ui.setHere('');
    ui.showGameOver({
      borough: B.id, boroughName: B.meta.name,
      score: state.score, tasks: state.tasksDone, landmarkCount: state.visited.size - 1,
      time: state.time, target: state.task, route: state.route_pts || [],
      map: B.map, graph: B.graph, landmarks: B.LANDMARKS, visited: state.visited,
    });
  }

  // ---------- two-player race (split screen) ----------
  // Both ghosts start at the same place and race to the same target. One chomper chases whoever is closer.
  // The match ends the moment anyone is caught. Most targets wins; a tie goes to whoever wasn't caught.
  const VS = [
    { name: 'Player 1', keys: 'W A S D', color: '#8f74ff' },
    { name: 'Player 2', keys: 'Arrow keys', color: '#12b3c4' },
  ];
  const VS_COUNTDOWN = 3;

  // the single-player models and the two-player models share one scene; show one set at a time
  function showSoloModels(on) {
    B.ghost3d.group.visible = on;
    B.bubble.setVisible(on);
    B.trail.mesh.visible = on;
    if (!on) B.arrow.update(0, 0, 0, 0, now);
    if (B.vs) for (const o of B.vs) { o.ghost3d.group.visible = !on; o.bubble.setVisible(!on); o.trail.mesh.visible = !on; if (on) o.arrow.update(0, 0, 0, 0, now); }
  }

  function startVersus() {
    const start = startPlace();
    Object.assign(state, {
      mode: 'play', versus: true, ghost: null, time: 0, score: 0, tasksDone: 0, taskTime: 0,
      used: new Set(), recentCats: [], chompers: [], countdown: VS_COUNTDOWN, result: null, danger: Infinity,
    });
    B.world.resetMarkers();
    B.world.setVisited(start.name);
    if (!B.vs) {
      const sc = B.world.scene;
      B.vs = VS.map((v) => ({
        ghost3d: new PM.Ghost3D(sc, v.color), bubble: new PM.Bubble3D(sc, v.color),
        trail: new PM.Trail3D(sc, v.color, CFG.trailSecs), arrow: new PM.HintArrow3D(sc), cam: B.world.camera.clone(),
      }));
      sizeVersusCams();
    }
    showSoloModels(false);
    state.players = VS.map((v, i) => {
      const o = B.vs[i];
      o.trail.reset();
      o.ghost3d.group.visible = true; o.bubble.setVisible(true);
      return { ...v, i, o, g: newGhost(start), found: 0, alive: true, diedAt: 0, visited: new Set([start.name]),
        hint: null, hintLog: [], passport: [], camPos: null, danger: Infinity };
    });
    newVersusTask(true);
    addChomper(alivePos());
    ui.showVersusHUD(B.meta, state.players);
    ui.setHere('');
    ui.showStartHint(false);
    audio.start();
  }

  function sizeVersusCams() {
    if (!B || !B.vs) return;
    for (const o of B.vs) { o.cam.aspect = innerWidth / 2 / innerHeight; o.cam.updateProjectionMatrix(); }
  }

  const alive = () => state.players.filter((p) => p.alive);
  const alivePos = () => alive().map((p) => p.g);

  // the next target: in range for every player still running, and about as far from each of them
  function newVersusTask(first) {
    const ps = alive().map((p) => posXY(p.g));
    const m = B.meta;
    const dists = (t) => ps.map((p) => Math.hypot(t.sx - p[0], t.sy - p[1]));
    const within = (t, lo, hi) => dists(t).every((d) => d >= lo && d <= hi);
    const pool = B.TARGETS.filter((t) => !state.used.has(t.name) && !state.recentCats.includes(t.cat));
    let cands = pool.filter((t) => within(t, m.task_min, first ? m.first_max : m.task_max));
    if (!cands.length) cands = pool.filter((t) => within(t, m.task_min * 0.6, Infinity));
    if (!cands.length) cands = B.TARGETS.filter((t) => !state.used.has(t.name) && within(t, 300, Infinity));
    if (!cands.length) { state.used.clear(); cands = B.TARGETS.filter((t) => within(t, 300, Infinity)); }
    if (!cands.length) cands = B.TARGETS.slice();
    const spread = (t) => { const d = dists(t); return Math.max(...d) - Math.min(...d); };
    cands.sort((a, b) => spread(a) - spread(b));
    const t = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
    state.task = t;
    state.used.add(t.name);
    state.recentCats.push(t.cat);
    if (state.recentCats.length > 2) state.recentCats.shift();
    state.taskTime = 0;
    for (const p of state.players) { p.hint = null; p.hintLog = []; ui.setVersusHints(p.i, []); }
    B.world.setTarget(t);
    ui.setVersusTask(t, CAT[t.cat], CAT_ICON[t.cat], state.tasksDone + 1);
  }

  function versusHint(p, landmark) {
    const t = state.task;
    const path = B.graph.path(p.g, t.pos);
    const miles = (path ? path.dist : Math.hypot(t.sx - landmark.sx, t.sy - landmark.sy)) / 1609.34;
    const txt = `${t.name} is ${miles < 0.1 ? 'under 0.1' : miles.toFixed(1)} mi away, ${describeDir(t.sx - landmark.sx, t.sy - landmark.sy)}.`;
    p.hint = { until: state.time + CFG.hintArrowSecs };
    p.hintLog.unshift({ from: landmark.name, text: txt });
    ui.setVersusHints(p.i, p.hintLog);
  }

  // end the match the moment anyone is caught
  function versusCheckEnd() {
    const [a, b] = state.players;
    const run = alive();
    if (run.length === 2) return false;
    let winner = null, reason;
    if (run.length === 1) {
      const s = run[0], d = s === a ? b : a;
      if (s.found !== d.found) {
        winner = s.found > d.found ? s : d;
        reason = winner === s ? `${d.name} got chomped. ${s.name} found more targets.` : `${d.name} got chomped, but found more targets.`;
      } else {
        winner = s;
        reason = `${d.name} got chomped. Same number of targets, so ${s.name} wins for staying free.`;
      }
    } else if (a.found !== b.found) {
      winner = a.found > b.found ? a : b;
      reason = `Both got chomped at once. ${winner.name} found more targets.`;
    } else reason = 'Both got chomped at once with the same number of targets.';
    state.mode = 'over';
    state.result = { winner, reason };
    audio.stop();
    if (winner) audio.fanfare();
    PM.Cloud.saveRun({ mode: 'versus', borough: B.id, time: Math.round(state.time), winner: winner ? winner.name : null, reason,
      players: state.players.map((p) => ({ name: p.name, found: p.found, caught: !p.alive,
        passport: p.passport.map((it) => ({ kind: it.kind, name: it.place.name })) })) });
    ui.showVersusOver({ boroughName: B.meta.name, players: state.players, winner, reason, time: state.time });
    return true;
  }

  function updateVersus(dt) {
    state.time += dt;
    if (state.countdown > 0) {
      state.countdown -= dt;
      if (state.countdown <= 0) {
        for (const p of state.players) p.g.started = true;
        audio.ding();
      }
      return;
    }
    state.taskTime += dt;
    const c = state.chompers[0];
    const pos = [];
    for (const p of state.players) {
      const g = p.g;
      if (!p.alive) { pos.push(posXY(g)); continue; }
      g.anim += dt;
      moveGhost(g, CFG.ghostSpeed * dt * (g.e.cls === 4 ? CFG.ferrySpeed : 1));
      const gp = posXY(g);
      pos.push(gp);
      p.o.trail.add(gp[0], gp[1], state.time);
    }

    // the chomper goes after whichever running player is closer
    c.spawnFx = Math.max(0, c.spawnFx - dt);
    let cp = posXY(c);
    let prey = null, pd = Infinity;
    for (const p of alive()) { const d = Math.hypot(pos[p.i][0] - cp[0], pos[p.i][1] - cp[1]); if (d < pd) { pd = d; prey = p; } }
    c.repath -= dt;
    if (c.repath <= 0 || c.prey !== prey) {
      const path = B.graph.path(c, prey.g, { noFerry: true });
      c.path = path ? path.nodes : [];
      c.goal = prey.g; c.prey = prey; c.mode = 'chase'; c.repath = 0.3;
    }
    if (c.spawnFx <= 0) moveChomper(c, CFG.ghostSpeed * chomperFactor(c) * dt, c.goal);
    c.mouth += dt * 10;
    cp = posXY(c);
    c.dist = Infinity;
    let caught = false;
    for (const p of alive()) {
      const d = Math.hypot(pos[p.i][0] - cp[0], pos[p.i][1] - cp[1]);
      p.danger = d;
      c.dist = Math.min(c.dist, d);
      if (d < CFG.catchDist && c.spawnFx <= 0) {
        p.alive = false; p.diedAt = state.time; p.danger = Infinity; caught = true;
        clearInput(p.g);
        audio.chomp();
        ui.setVersusPlayer(p);
      }
    }
    if (caught) { versusCheckEnd(); return; }
    audio.proximity(Math.min(...alive().map((p) => p.danger)));

    for (const p of alive()) {
      const gp = pos[p.i];
      for (const l of B.LANDMARKS) {
        if (p.visited.has(l.name) || Math.hypot(l.sx - gp[0], l.sy - gp[1]) >= CFG.arriveDist) continue;
        p.visited.add(l.name);
        p.passport.push({ kind: 'landmark', place: l });
        ui.setVersusPassport(p.i, p.passport);
        versusHint(p, l);
        audio.ding();
        ui.toast({ title: '★ ' + l.name, body: 'Hint: ' + p.hintLog[0].text, kind: 'info', secs: 6, side: p.i });
      }
    }

    const t = state.task;
    for (const p of alive()) {
      const gp = pos[p.i];
      if (Math.hypot(t.sx - gp[0], t.sy - gp[1]) >= CFG.arriveDist) continue;
      p.found++;
      state.tasksDone++;
      p.passport.push({ kind: 'found', place: t });
      ui.setVersusPassport(p.i, p.passport);
      ui.setVersusPlayer(p);
      if (versusCheckEnd()) return;
      audio.fanfare();
      // freeze the race and show the place on both halves until both players are ready
      state.mode = 'vscard';
      state.cardAt = performance.now();
      state.ready = state.players.map((q) => !q.alive);
      for (const q of state.players) clearInput(q.g);
      ui.showVersusCards({ place: t, cat: CAT[t.cat], icon: CAT_ICON[t.cat], finder: p, players: state.players, ready: state.ready });
      return;
    }
  }

  // a player pressed one of their keys while the place cards are up
  function versusReady(i) {
    if (i < 0 || state.ready[i] || performance.now() - state.cardAt < 600) return;
    state.ready[i] = true;
    ui.setVersusReady(state.ready);
    if (!state.ready.every(Boolean)) return;
    ui.hideVersusCards();
    newVersusTask(false);
    respawnAll(alivePos());
    for (const q of alive()) ui.toast({ title: 'Next: ' + state.task.name, body: 'The chomper lost your trail, for now. It\'s faster this time.', kind: 'info', secs: 5, side: q.i });
    state.countdown = VS_COUNTDOWN;
    state.mode = 'play';
    last = performance.now();
  }

  // project a ground point through a player's camera, in CSS px within that player's half
  function toView(cam, x, y, h, vw, vh) {
    const v = new THREE.Vector3(x, h, y).project(cam);
    return [(v.x * 0.5 + 0.5) * vw, (-v.y * 0.5 + 0.5) * vh, v.z];
  }

  function drawVersus(dt) {
    const world = B.world;
    const halfW = innerWidth / 2, vh = innerHeight;
    const ps = state.players;
    const pos = ps.map((p) => posXY(p.g));
    const k = 1 - Math.pow(0.0005, dt);
    for (const p of ps) {
      const gp = pos[p.i];
      if (!p.camPos || Math.hypot(gp[0] - p.camPos[0], gp[1] - p.camPos[1]) > 600) p.camPos = gp.slice();
      p.camPos[0] += (gp[0] - p.camPos[0]) * k; p.camPos[1] += (gp[1] - p.camPos[1]) * k;
    }
    // stream the city around both players; each call keeps the other player's tiles
    for (const p of ps) {
      const o = ps[1 - p.i].camPos;
      world.updateGround(p.camPos[0], p.camPos[1], 1, [o]);
      world.updateBuildings(p.camPos[0], p.camPos[1], 3);
    }

    const playing = state.mode === 'play' && state.countdown <= 0;
    for (const p of ps) {
      const g = p.g, gp = pos[p.i], o = p.o;
      o.ghost3d.group.visible = p.alive;
      o.bubble.setVisible(p.alive);
      if (p.alive) {
        const gh = g.moving ? B.graph.headingAt(g.e, g.s, g.dir) : null;
        o.ghost3d.update(gp[0], gp[1], gh, g.anim + now, p.danger < 220 && playing, g.moving && g.started);
        o.bubble.update(gp[0], gp[1], now, p.danger);
      }
      o.trail.update(state.time, p.alive ? gp[0] : undefined, gp[1]);
    }
    B.chompers3d.forEach((m, i) => {
      const c = state.chompers[i];
      m.setVisible(!!c);
      if (!c) return;
      const cp = posXY(c);
      m.update(cp[0], cp[1], B.graph.headingAt(c.e, c.s, c.dir), Math.abs(Math.sin(c.mouth)), now + i, c.spawnFx, c.dist < 400);
    });

    const t = state.task;
    fctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      const gp = pos[p.i];
      // each half shows only its own hint arrow and its own unvisited landmarks
      for (const q of ps) {
        if (q === p && q.alive && q.hint && state.time < q.hint.until) {
          q.o.arrow.update(gp[0], gp[1], Math.atan2(t.sy - gp[1], t.sx - gp[0]), Math.min(1, (q.hint.until - state.time) / 2), now);
        } else q.o.arrow.update(0, 0, 0, 0, now);
      }
      // your own ghost stays on top: hide the rival's ghost where it overlaps yours (as at the start)
      for (const q of ps) {
        const show = q.alive && (q === p || Math.hypot(pos[q.i][0] - gp[0], pos[q.i][1] - gp[1]) > 40);
        q.o.ghost3d.group.visible = show;
        q.o.bubble.setVisible(show);
      }
      for (const [name, m] of world.markers) {
        const seen = p.visited.has(name);
        m.g.visible = !seen;
        m.sprite.visible = !seen && Math.hypot(m.g.position.x - gp[0], m.g.position.z - gp[1]) < 1100;
      }
      world.render(p.camPos, now, p.alive ? gp : null, { camera: p.o.cam, x: p.i * halfW, y: 0, w: halfW, h: vh });

      // 2D overlay for this half: chomper pointer, danger glow, "chomped" veil
      fctx.save();
      fctx.translate(p.i * halfW * DPR, 0);
      fctx.beginPath(); fctx.rect(0, 0, halfW * DPR, H); fctx.clip();
      const hw = halfW * DPR;
      for (const c of state.chompers) {
        const cp = posXY(c);
        const [csx, csy, cz] = toView(p.o.cam, cp[0], cp[1], 14, halfW, vh);
        const off = cz > 1 || csx < 0 || csy < 0 || csx > halfW || csy > vh;
        const d = Math.hypot(cp[0] - gp[0], cp[1] - gp[1]);
        if (off && p.alive) PM.Sprites.edgeArrow(fctx, hw, H, cz > 1 ? hw - csx * DPR : csx * DPR, cz > 1 ? H - csy * DPR : csy * DPR, DPR, d, c.color);
      }
      if (p.alive && p.danger < 320 && playing) {
        const a = (1 - p.danger / 320) * 0.45;
        const grd = fctx.createRadialGradient(hw / 2, H / 2, Math.min(hw, H) * 0.3, hw / 2, H / 2, Math.max(hw, H) * 0.7);
        grd.addColorStop(0, 'rgba(255,60,90,0)'); grd.addColorStop(1, `rgba(255,60,90,${a})`);
        fctx.fillStyle = grd; fctx.fillRect(0, 0, hw, H);
      }
      if (!p.alive) {
        fctx.fillStyle = 'rgba(36,31,61,0.55)'; fctx.fillRect(0, 0, hw, H);
        fctx.fillStyle = '#fff'; fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
        fctx.font = `${40 * DPR}px Bungee, "DM Sans", sans-serif`;
        fctx.fillText('CHOMPED', hw / 2, H / 2);
        fctx.font = `700 ${16 * DPR}px "DM Sans", sans-serif`;
        fctx.fillText(`${p.found} target${p.found === 1 ? '' : 's'} · out at ${Math.floor(p.diedAt / 60)}:${String(Math.floor(p.diedAt % 60)).padStart(2, '0')}`, hw / 2, H / 2 + 40 * DPR);
      }
      fctx.restore();
      ui.setVersusStreet(p.i, p.alive ? streetText(p.g) : '');
    }
    ui.setVersusCountdown(state.mode === 'play' || state.mode === 'pause' ? state.countdown : 0);
    if (state.mode === 'play' && !world.lowQ) {
      perf.t += dt; perf.n++;
      if (perf.t > 4) { if (perf.n / perf.t < 28) world.lowerQuality(); perf.t = 0; perf.n = 0; }
    }
  }

  // ---------- update ----------
  function update(dt) {
    state.time += dt;
    const g = state.ghost;
    if (!g.started) return;
    state.taskTime += dt;
    if (!state.revealed && state.taskTime > CFG.revealSecs) reveal();
    g.anim += dt;
    moveGhost(g, CFG.ghostSpeed * dt * (g.e.cls === 4 ? CFG.ferrySpeed : 1));
    const onFerry = g.e.cls === 4;
    if (g.e !== state.lastEdge && / Bridge$/.test(g.e.name) && g.e.len > 500) {
      const bridgeLesson = (LESSONS.edges || {})[g.e.name];
      voice.play('bridge-' + g.e.name.toLowerCase().replace(/ /g, '-'), 60);
      if (bridgeLesson) ui.toast({ title: g.e.name, body: bridgeLesson.text, kind: 'info', secs: 6 });
    }
    state.lastEdge = g.e;
    if (onFerry && !state.onFerry) {
      const ferryLesson = (LESSONS.edges || {}).ferry;
      voice.play('ferry');
      ui.toast({ title: 'All aboard the ' + g.e.name, body: ferryLesson ? ferryLesson.text : 'Chompers can\'t swim. They\'ll wait at the terminal.', kind: 'info', secs: 6 });
    }
    state.onFerry = onFerry;
    const gp = posXY(g);
    B.trail.add(gp[0], gp[1], state.time);

    const cx = Math.floor(gp[0] / 100), cy = Math.floor(gp[1] / 100);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 7) state.fog.add((cx + i) + ',' + (cy + j));
    state.routeTimer -= dt;
    if (state.routeTimer <= 0) { (state.route_pts = state.route_pts || []).push(gp); state.routeTimer = 0.4; }

    // the ghost's likely route to the target (for the ambusher), refreshed each second
    if (state.time - state.routeAt > 1) {
      const p = B.graph.path(g, state.task.pos);
      state.route = p ? p.nodes : null;
      state.routeAt = state.time;
    }

    let danger = Infinity;
    for (const c of state.chompers) {
      c.spawnFx = Math.max(0, c.spawnFx - dt);
      c.roamT = (c.roamT || 0) + dt;
      const cp = posXY(c);
      const goal = chomperGoal(c, g, gp, cp);
      c.mode = goal.mode;
      c.repath -= dt;
      if (c.repath <= 0 || c.goalMode !== goal.mode) {
        const p = B.graph.path(c, goal.pos, { noFerry: true });
        c.path = p ? p.nodes : [];
        c.goal = goal.pos; c.goalMode = goal.mode;
        c.repath = c.kind === 'chaser' ? 0.3 : 0.5;
      }
      if (c.spawnFx <= 0) moveChomper(c, CFG.ghostSpeed * chomperFactor(c) * dt, c.goal || g);
      c.mouth += dt * 10;
      const np = posXY(c);
      const d = Math.hypot(np[0] - gp[0], np[1] - gp[1]);
      c.dist = d;
      danger = Math.min(danger, d);
      if (d < CFG.catchDist && c.spawnFx <= 0) { state.danger = d; gameOver(); return; }
    }
    state.danger = danger;
    audio.proximity(danger);
    if (danger < 110) voice.play('behind', 25);

    // warm up HD photos for places the ghost is getting close to, so cards open sharp
    for (const pl of [state.task, ...B.LANDMARKS]) {
      if (pl.img && !pl._pre && Math.hypot(pl.sx - gp[0], pl.sy - gp[1]) < 450) { pl._pre = new Image(); pl._pre.src = pl.img; }
    }

    for (const l of B.LANDMARKS) {
      if (state.visited.has(l.name)) continue;
      if (Math.hypot(l.sx - gp[0], l.sy - gp[1]) < CFG.arriveDist) {
        state.visited.add(l.name);
        B.world.setVisited(l.name);
        state.score += CFG.landmarkPts;
        const hint = giveHint(l);
        addToPassport('landmark', l);
        audio.ding();
        voice.play('landmark');
        PM.Tiger.event(B.id, l.name, 'landmark', null);
        openCard({ kind: 'landmark', place: l, points: CFG.landmarkPts, hint, lesson: lessonFor(l.name) });
        return;
      }
    }

    const t = state.task;
    if (Math.hypot(t.sx - gp[0], t.sy - gp[1]) < CFG.arriveDist) {
      const solved = !state.revealed;
      const pts = Math.round(taskPoints() * (solved ? CFG.riddleBonus : 1));
      state.score += pts;
      state.tasksDone++;
      audio.fanfare();
      addToPassport('found', t);
      state.afterCard = () => {
        newTask(false);
        let added = null;
        respawnAll();
        if (state.chompers.length < CFG.maxChompers) added = addChomper();
        ui.setChompers(state.chompers.length);
        if (added) voice.play('chomper');
        if (added) ui.toast({ title: `${added.name} joined the hunt!`, body: added.desc + ' Everyone else lost your trail, for now.', kind: 'warn', secs: 6 });
        else ui.toast({ title: state.revealed ? 'New task: find ' + state.task.name : 'New riddle to solve', body: 'The chompers lost your trail, for now. They’re faster this time.', kind: 'info', secs: 5 });
      };
      voice.play(solved ? 'solved' : 'found');
      if (t.riddle) PM.Tiger.event(B.id, t.name, solved ? 'solved' : 'found', state.taskTime);
      openCard({ kind: 'found', place: t, points: pts, cat: CAT[t.cat], solved, lesson: lessonFor(t.name) });
      ui.setScore(state.score);
      return;
    }
    ui.setScore(state.score);
  }

  // "Postcard from your run": the run's real facts go to api/recap (Gemini writes it, ElevenLabs reads it)
  function sendPostcard() {
    const g = state.ghost;
    const catcher = state.chompers.reduce((a, c) => ((c.dist ?? Infinity) < (a.dist ?? Infinity) ? c : a), state.chompers[0]);
    const p = state.task ? B.graph.path(g, state.task.pos) : null;
    const facts = {
      borough: B.meta.name, start: startPlace().name,
      reached: state.passport.map((it) => it.place.name),
      found: state.passport.filter((it) => it.kind === 'found').map((it) => it.place.name),
      target: state.task ? state.task.name : '', milesFromTarget: p ? p.dist / 1609.34 : null,
      street: streetText(g), seconds: Math.round(state.time), caughtBy: catcher ? catcher.name : 'a chomper', score: state.score,
    };
    const run = (state.postcardRun = (state.postcardRun || 0) + 1);
    ui.setPostcard('Writing your postcard…', '');
    fetch('api/recap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, voice: !voice.muted }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (run !== state.postcardRun || state.mode !== 'over') return;
        if (!d || !d.text) { ui.setPostcard(null); return; }
        ui.setPostcard(d.text, d.source === 'gemini' ? 'Written by Gemini from this run, read by ElevenLabs' : 'From this run');
        if (d.audio) voice.playData('data:audio/mpeg;base64,' + d.audio);
      })
      .catch(() => ui.setPostcard(null));
  }

  function streetText(g) {
    const a = g.e.name || (g.e.cls === 0 ? 'Park path' : '');
    const node = g.moving ? (g.dir > 0 ? g.e.b : g.e.a) : g.node;
    let b = '';
    for (const e of B.graph.adj[node]) if (e.name && e.name !== g.e.name) { b = e.name; break; }
    return a ? (b ? `${a} & ${b}` : a) : b;
  }

  // ---------- draw ----------
  let camPos = null;
  const perf = { t: 0, n: 0 };
  function draw(dt) {
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    if (state.versus && B && state.players && ['play', 'pause', 'over', 'vscard'].includes(state.mode)) return drawVersus(dt);
    fctx.clearRect(0, 0, W, H);
    if (demo && demo.b === B && (state.mode === 'title' || state.mode === 'lobby')) return drawDemo(dt);
    if (!B || state.mode === 'title' || state.mode === 'lobby' || state.mode === 'loading') {
      renderer.setClearColor('#cfe8f7'); renderer.clear();
      return;
    }
    const world = B.world;
    if (state.mode === 'building') {
      const [fx0, fz0] = B.loadFocus;
      world.updateGround(fx0, fz0, 3);
      world.updateBuildings(fx0, fz0, 30);
      const near = world.pendingNear(fx0, fz0, 1100);
      ui.showLoading(B.meta.name, 0.5 + 0.5 * (1 - Math.min(1, near / Math.max(1, B.nearTotal || near))), 'Building the city in 3D…');
      if (B.nearTotal === undefined) B.nearTotal = near;
      world.render(B.loadFocus, now, null);
      if (near === 0) { B.nearTotal = undefined; state.versus ? startVersus() : startRun(); }
      return;
    }
    const g = state.ghost;
    const gp = posXY(g);
    if (!camPos) camPos = gp.slice();
    const k = 1 - Math.pow(0.0005, dt);
    camPos[0] += (gp[0] - camPos[0]) * k; camPos[1] += (gp[1] - camPos[1]) * k;
    if (Math.hypot(gp[0] - camPos[0], gp[1] - camPos[1]) > 600) camPos = gp.slice();

    world.updateGround(camPos[0], camPos[1], 2);
    world.updateBuildings(camPos[0], camPos[1], 5);

    const danger = state.danger === undefined ? Infinity : state.danger;
    const gh = g.moving ? B.graph.headingAt(g.e, g.s, g.dir) : null;
    B.ghost3d.update(gp[0], gp[1], gh, g.anim + now, danger < 220 && state.mode === 'play', g.moving && g.started);
    B.bubble.update(gp[0], gp[1], now, danger);
    B.trail.update(state.time, gp[0], gp[1]);
    B.chompers3d.forEach((m, i) => {
      const c = state.chompers[i];
      m.setVisible(!!c);
      if (!c) return;
      const cp = posXY(c);
      m.update(cp[0], cp[1], B.graph.headingAt(c.e, c.s, c.dir), Math.abs(Math.sin(c.mouth)), now + i, c.spawnFx, c.mode === 'chase' && c.dist < 400);
    });

    const t = state.task;
    if (state.hint && state.time < state.hint.until) {
      B.arrow.update(gp[0], gp[1], Math.atan2(t.sy - gp[1], t.sx - gp[0]), Math.min(1, (state.hint.until - state.time) / 2), now);
    } else B.arrow.update(0, 0, 0, 0, now);

    for (const m of world.markers.values()) {
      const dd = Math.hypot(m.g.position.x - gp[0], m.g.position.z - gp[1]);
      m.sprite.visible = dd < 1100 && !m.visited;
    }

    world.render(camPos, now, gp);
    if ((state.mode === 'play') && !world.lowQ) {
      perf.t += dt; perf.n++;
      if (perf.t > 4) { if (perf.n / perf.t < 28) world.lowerQuality(); perf.t = 0; perf.n = 0; }
    }

    // 2D overlay: cursor aim line, off-screen chomper pointers, danger vignette
    const [gsx, gsy] = world.toScreen(gp[0], gp[1], 2);
    if (mouseActive && state.cursorWorld && state.mode === 'play' && g.started) {
      const [mx, my] = world.toScreen(state.cursorWorld[0], state.cursorWorld[1]);
      fctx.save();
      fctx.strokeStyle = 'rgba(143,116,255,0.75)'; fctx.lineWidth = 2.5 * DPR; fctx.setLineDash([2 * DPR, 7 * DPR]); fctx.lineCap = 'round';
      fctx.beginPath(); fctx.moveTo(gsx * DPR, gsy * DPR); fctx.lineTo(mx * DPR, my * DPR); fctx.stroke();
      fctx.setLineDash([]);
      fctx.beginPath(); fctx.arc(mx * DPR, my * DPR, 11 * DPR, 0, Math.PI * 2); fctx.stroke();
      fctx.restore();
    }
    for (const c of state.chompers) {
      const cp = posXY(c);
      const [csx, csy, cz] = world.toScreen(cp[0], cp[1], 14);
      const off = cz > 1 || csx < 0 || csy < 0 || csx > innerWidth || csy > innerHeight;
      if (off) PM.Sprites.edgeArrow(fctx, W, H, cz > 1 ? W - csx * DPR : csx * DPR, cz > 1 ? H - csy * DPR : csy * DPR, DPR, Number.isFinite(c.dist) ? c.dist : Math.hypot(cp[0] - gp[0], cp[1] - gp[1]), c.color);
    }
    if (danger < 320 && state.mode === 'play') {
      const a = (1 - danger / 320) * 0.45;
      const grd = fctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(255,60,90,0)'); grd.addColorStop(1, `rgba(255,60,90,${a})`);
      fctx.fillStyle = grd; fctx.fillRect(0, 0, W, H);
    }

    ui.setHere(state.mode === 'play' || state.mode === 'pause' ? streetText(g) : '', gsx, gsy - 44);
    ui.showStartHint(!g.started && state.mode === 'play');
    ui.drawMinimap({ graph: B.graph, map: B.map, fog: state.fog, ghost: gp, trail: B.trail.pts,
      chompers: state.chompers.map((c) => ({ p: posXY(c), color: c.color })),
      landmarks: B.LANDMARKS, visited: state.visited, cam: camPos, viewW: 1100, viewH: 900 });
  }

  // ---------- title screen: attract mode ----------
  // Behind the title and the lobby a live city plays itself: a ghost wanders real streets and two
  // chompers chase it, so you can see what the game is before you pick a map.
  let demo = null, demoLoad = null;
  function startDemo() {
    if (!B) return;
    const start = startPlace();
    const g = { e: start.pos.e, s: start.pos.s, dir: 1 };
    const [x, y] = B.graph.pointAt(g.e, g.s);
    const cs = [[260, 240], [-300, 200]].map(([dx, dy], i) => {
      const n = B.graph.nearest(x + dx, y + dy, 800) || { e: g.e, s: 0 };
      return { ...KINDS[i], e: n.e, s: n.s, dir: 1, path: [], repath: 0, mouth: 0, dist: Infinity };
    });
    demo = { b: B, g, cs, home: [start.sx, start.sy] };
    B.trail.reset();
    B.world.resetMarkers();
    showSoloModels(true);
    camPos = null;
    document.body.classList.add('live');
  }
  // wander: mostly straight on at intersections, a little random, drift back if it gets far from home
  function demoWalk(g, dist) {
    const graph = B.graph;
    let guard = 0;
    while (dist > 1e-6 && guard++ < 20) {
      const remain = g.dir > 0 ? g.e.len - g.s : g.s;
      if (dist < remain) { g.s += dist * g.dir; return; }
      dist -= remain;
      const node = g.dir > 0 ? g.e.b : g.e.a;
      const h = graph.headingAt(g.e, g.dir > 0 ? g.e.len : 0, g.dir);
      const nx = graph.nx[node], ny = graph.ny[node];
      const far = Math.hypot(nx - demo.home[0], ny - demo.home[1]) > 1600;
      let opts = graph.adj[node].filter((e) => e !== g.e && e.cls !== 0 && e.cls !== 4);
      if (!opts.length) opts = graph.adj[node].filter((e) => e !== g.e);
      if (!opts.length) opts = [g.e]; // dead end: turn around
      let best = opts[0], bs = -Infinity;
      for (const e of opts) {
        const o = graph.outHeading(e, node);
        let sc = o[0] * h[0] + o[1] * h[1] + Math.random() * 1.1;
        if (far) sc += ((demo.home[0] - nx) * o[0] + (demo.home[1] - ny) * o[1]) / 500;
        if (sc > bs) { bs = sc; best = e; }
      }
      enterEdge(g, best, node);
    }
  }
  function drawDemo(dt) {
    const world = B.world, g = demo.g;
    demoWalk(g, CFG.ghostSpeed * 0.85 * dt);
    const gp = posXY(g);
    B.trail.add(gp[0], gp[1], now);
    demo.cs.forEach((c, i) => {
      c.repath -= dt;
      if (c.repath <= 0) { const p = B.graph.path(c, g, { noFerry: true }); c.path = p ? p.nodes : []; c.repath = 0.6; }
      moveChomper(c, CFG.ghostSpeed * (i ? 0.66 : 0.76) * dt, g);
      c.mouth += dt * 10;
      const cp = posXY(c);
      c.dist = Math.hypot(cp[0] - gp[0], cp[1] - gp[1]);
      if (c.dist < 30) { // caught in the demo: it pops back out somewhere behind
        const n = B.graph.nearest(gp[0] + (Math.random() - 0.5) * 900, gp[1] + (Math.random() - 0.5) * 900, 800);
        if (n) { c.e = n.e; c.s = n.s; c.path = []; c.repath = 0; }
      }
    });
    // the camera drifts gently around the chase
    const want = [gp[0] + Math.sin(now * 0.12) * 140, gp[1] + Math.cos(now * 0.09) * 90];
    if (!camPos) camPos = want.slice();
    const k = 1 - Math.pow(0.05, dt);
    camPos[0] += (want[0] - camPos[0]) * k; camPos[1] += (want[1] - camPos[1]) * k;
    world.updateGround(camPos[0], camPos[1], 2);
    world.updateBuildings(camPos[0], camPos[1], 6);
    const near = Math.min(...demo.cs.map((c) => c.dist));
    B.ghost3d.update(gp[0], gp[1], B.graph.headingAt(g.e, g.s, g.dir), now, near < 160, true);
    B.bubble.update(gp[0], gp[1], now, near);
    B.trail.update(now, gp[0], gp[1]);
    B.chompers3d.forEach((m, i) => {
      const c = demo.cs[i];
      m.setVisible(!!c);
      if (!c) return;
      const cp = posXY(c);
      m.update(cp[0], cp[1], B.graph.headingAt(c.e, c.s, c.dir), Math.abs(Math.sin(c.mouth)), now + i, 0, c.dist < 400);
    });
    B.arrow.update(0, 0, 0, 0, now);
    for (const m of world.markers.values()) m.sprite.visible = Math.hypot(m.g.position.x - gp[0], m.g.position.z - gp[1]) < 1100;
    world.render(camPos, now, gp);
    if (state.mode === 'title') { // point out who's who
      demoLabel(world, gp, 'YOU', '#7b5cff');
      const c = demo.cs.reduce((a, b) => (b.dist < a.dist ? b : a));
      if (c.dist < 700) demoLabel(world, posXY(c), 'CHOMPER', '#e0a800');
    }
  }
  function demoLabel(world, p, text, color) {
    const [sx, sy, z] = world.toScreen(p[0], p[1], 34);
    if (z > 1) return;
    const x = sx * DPR, y = sy * DPR;
    fctx.save();
    fctx.font = `800 ${12 * DPR}px "DM Sans", system-ui, sans-serif`;
    const w = fctx.measureText(text).width + 18 * DPR, h = 24 * DPR;
    fctx.fillStyle = color; fctx.beginPath(); fctx.roundRect(x - w / 2, y - h, w, h, h / 2); fctx.fill();
    fctx.beginPath(); fctx.moveTo(x - 6 * DPR, y - 1); fctx.lineTo(x + 6 * DPR, y - 1); fctx.lineTo(x, y + 7 * DPR); fctx.fill();
    fctx.fillStyle = '#fff'; fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
    fctx.fillText(text, x, y - h / 2);
    fctx.restore();
  }
  function leaveTitle() {
    if (state.mode !== 'title') return;
    audio.unlock();
    state.mode = 'lobby';
    ui.showLobby();
    voice.play('welcome');
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now += dt;
    // keep the loop alive even if one frame throws, so an error can't freeze the whole game
    try { if (state.mode === 'play') (state.versus ? updateVersus : update)(dt); } catch (e) { console.error(e); }
    try { draw(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }

  let lobby = [];
  let picked = null;
  // a map card was clicked: ask for one or two players next
  function pick(id) {
    picked = id;
    ui.showModePick(lobby.find((b) => b.id === id).name);
  }
  function chooseMode(versus) {
    audio.unlock();
    state.versus = versus;
    loadBorough(picked).catch((e) => {
      console.error(e);
      ui.showLoading('failed', 0, 'The map could not load: ' + e.message + '. Serve the folder over http (see README).');
    });
  }

  ui.init({
    onPick: pick,
    onMode: chooseMode,
    onAgain: () => { camPos = null; state.versus ? startVersus() : startRun(); },
    onLobby: () => { state.mode = 'lobby'; audio.stop(); ui.setHere(''); ui.showLobby(); startDemo(); },
    onTitle: leaveTitle,
    onResume: togglePause,
    onToggleMute: muteAll,
    onCloseCard: closeCard,
    onRevisit: (i) => {
      if (state.mode !== 'play' && state.mode !== 'pause') return;
      if (state.mode === 'pause') ui.showPause(false);
      const it = state.passport[i];
      if (it) openCard({ kind: 'revisit', place: it.place, cat: it.kind === 'found' ? CAT[it.place.cat] : '', lesson: lessonFor(it.place.name) });
    },
  });
  ui.showTitle();
  // the title screen plays itself on Manhattan; picking Manhattan later reuses this load
  demoLoad = ensureBorough('manhattan').then(() => { if (state.mode === 'title' || state.mode === 'lobby') startDemo(); });
  demoLoad.catch((e) => console.warn('title screen demo:', e));
  fetchJSON('data/boroughs.json').then((list) => {
    lobby = list; ui.renderLobby(list);
    // resend saves that failed last time, and pull this player's stamps from MongoDB
    PM.Cloud.start(list.map((b) => b.id)).then((learned) => { if (learned) ui.renderLobby(lobby); });
  })
    .catch((e) => ui.showLoading('the lobby', 0, 'Could not load the borough list: ' + e.message + '. Serve the folder over http (see README).'));
  requestAnimationFrame(frame);

  window.PM.debug = { state, CFG, get B() { return B; }, get demo() { return demo; }, pick, chooseMode, startRun, startVersus, closeCard,
    press: (d) => { const g = state.ghost; g.inp.queued = d; g.inp.queuedAt = now; g.started = true; },
    hold: (d, on) => (on ? state.ghost.inp.held.add(d) : state.ghost.inp.held.delete(d)),
    // two-player: i is 0 (WASD) or 1 (arrows)
    vsPress: (i, d) => { const g = state.players[i].g; g.inp.queued = d; g.inp.queuedAt = now; },
    vsHold: (i, d, on) => { const h = state.players[i].g.inp.held; on ? h.add(d) : h.delete(d); } };
})();
