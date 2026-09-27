// Pac-Manhattan: lobby, borough loading, and the core game loop (3D).
(function () {
  const PM = window.PM;

  // ---------- tuning ----------
  const CFG = {
    ghostSpeed: 82,           // metres per game-second
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

  let B = null; // the loaded borough: data, graph, world, 3D objects, places
  const cache = {};

  let W = 0, H = 0;
  function resize() {
    W = Math.floor(innerWidth * DPR); H = Math.floor(innerHeight * DPR);
    renderer.setSize(innerWidth, innerHeight, false);
    if (B) { B.world.camera.aspect = innerWidth / innerHeight; B.world.camera.updateProjectionMatrix(); B.world.w = W; B.world.h = H; }
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

  async function loadBorough(id) {
    const info = lobby.find((b) => b.id === id);
    state.mode = 'loading';
    ui.showLoading(info.name, 0.05, 'Downloading the map…');
    if (B && B.id !== id) { B.world.dispose(); B = null; }
    if (!B) {
      let raw = cache[id];
      if (!raw) {
        let done = 0;
        const step = (p) => p.then((v) => { done++; ui.showLoading(info.name, 0.05 + done * 0.15, 'Downloading the map…'); return v; });
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
    // build the city around the start before the run begins
    const start = startPlace();
    B.loadFocus = [start.sx, start.sy];
    state.mode = 'building';
  }

  function startPlace() {
    return B.LANDMARKS.find((l) => l.name === B.meta.start) || B.LANDMARKS[0];
  }

  // ---------- input ----------
  const held = new Set();
  let queued = null, queuedAt = 0;
  let mouse = null, mouseActive = false;
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  addEventListener('keydown', (ev) => {
    if (state.mode === 'card') {
      if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'Escape') { ev.preventDefault(); closeCard(); }
      return;
    }
    const d = KEYMAP[ev.code];
    if (d) {
      if (state.mode !== 'play') return;
      ev.preventDefault();
      held.add(d); queued = d; queuedAt = now; mouseActive = false;
      audio.unlock();
      if (!state.ghost.started) state.ghost.started = true;
      return;
    }
    if ((ev.code === 'KeyP' || ev.code === 'Escape') && (state.mode === 'play' || state.mode === 'pause')) togglePause();
    if (ev.code === 'KeyM') ui.setMuted(audio.toggleMute());
  });
  addEventListener('keyup', (ev) => { const d = KEYMAP[ev.code]; if (d) held.delete(d); });
  addEventListener('blur', () => { held.clear(); if (state.mode === 'play') togglePause(); });
  const onPointer = (ev) => {
    mouse = [ev.clientX, ev.clientY];
    if (state.mode === 'play') mouseActive = true;
  };
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerdown', (ev) => { onPointer(ev); if (state.mode === 'play' && !state.ghost.started) { state.ghost.started = true; audio.unlock(); } });

  function wanted() {
    for (const d of ['up', 'down', 'left', 'right']) if (held.has(d)) return { v: DIRS[d], key: d };
    if (queued && now - queuedAt < 1.6) return { v: DIRS[queued], key: queued };
    if (mouseActive && mouse && state.ghost) {
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
    const want = wanted();
    const wv = want && want.v;
    const turnDot = want && want.cursor ? 0.25 : 0.62;
    if (wv && g.moving) {
      const h = graph.headingAt(g.e, g.s, g.dir);
      if (dot(h, wv) < (want.cursor ? -0.35 : -0.6)) { g.dir = -g.dir; if (!want.cursor) queued = null; }
    }
    let guard = 0;
    while (dist > 1e-6 && guard++ < 20) {
      if (!g.moving) {
        if (!wv) return;
        const pick = chooseEdge(g.node, null, wv, turnDot);
        if (!pick) return;
        enterEdge(g, pick, g.node);
        g.moving = true; if (!want.cursor) queued = null;
        continue;
      }
      const remain = g.dir > 0 ? g.e.len - g.s : g.s;
      if (dist < remain) { g.s += dist * g.dir; return; }
      dist -= remain;
      const node = g.dir > 0 ? g.e.b : g.e.a;
      g.s = g.dir > 0 ? g.e.len : 0;
      const heading = graph.headingAt(g.e, g.s, g.dir);
      let pick = wv ? chooseEdge(node, g.e, wv, turnDot) : null;
      if (pick && want.key && want.key === queued && !held.has(want.key)) queued = null;
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
      } else if (target.e.a === next || target.e.b === next) {
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
  const state = { mode: 'lobby', chompers: [] };

  function startRun() {
    const start = startPlace();
    Object.assign(state, {
      mode: 'play', time: 0, score: 0, tasksDone: 0, taskTime: 0,
      visited: new Set([start.name]), used: new Set(), recentCats: [], route: null, route_pts: [], routeTimer: 0,
      hint: null, fog: new Set(), cursorWorld: null, chompers: [], passport: [], routeAt: -9, afterCard: null,
    });
    state.stamps = PM.loadStamps(B.id);
    B.world.resetMarkers();
    B.world.setVisited(start.name);
    B.trail.reset();
    const g = (state.ghost = { e: start.pos.e, s: start.pos.s, dir: 1, moving: false, started: false, anim: 0 });
    if (g.s < g.e.len / 2) { g.node = g.e.a; g.s = 0; } else { g.node = g.e.b; g.s = g.e.len; }
    queued = null; mouseActive = false; camPos = null;
    newTask(true);
    addChomper();
    ui.showHUD(B.meta);
    ui.setPassport([], B.LANDMARKS.length, state.stamps.size);
    ui.setChompers(1);
    ui.toast({ title: 'You are the ghost', body: 'Find ' + state.task.name + '. It glows gold when you get close. Visit ★ landmarks for hints.', kind: 'info', secs: 7 });
    audio.start();
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
    ui.setTask(t, CAT[t.cat], CAT_ICON[t.cat], state.tasksDone + 1);
    ui.setHints([]);
  }

  // pick far-away spawn points: not near the ghost, the target, or each other
  function spawnPoints(count) {
    const graph = B.graph;
    const dist = graph.distancesFrom(state.ghost, CFG.spawnMax * 1.6);
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

  function addChomper() {
    const k = KINDS[state.chompers.length];
    const c = { ...k, mouth: 0 };
    placeChomper(c, spawnPoints(1)[0]);
    state.chompers.push(c);
    return c;
  }

  function respawnAll() {
    const pts = spawnPoints(state.chompers.length);
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
    held.clear(); queued = null;
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

  function giveHint(landmark) {
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
    if (kind === 'landmark') { state.stamps.add(place.name); PM.saveStamps(B.id, state.stamps); }
    ui.setPassport(state.passport, B.LANDMARKS.length, state.stamps.size);
  }

  function gameOver() {
    state.mode = 'over';
    audio.chomp(); audio.stop();
    ui.hideHUD();
    ui.setHere('');
    ui.showGameOver({
      borough: B.id, boroughName: B.meta.name,
      score: state.score, tasks: state.tasksDone, landmarkCount: state.visited.size - 1,
      time: state.time, target: state.task, route: state.route_pts || [],
      map: B.map, graph: B.graph, landmarks: B.LANDMARKS, visited: state.visited,
    });
  }

  // ---------- update ----------
  function update(dt) {
    state.time += dt;
    const g = state.ghost;
    if (!g.started) return;
    state.taskTime += dt;
    g.anim += dt;
    moveGhost(g, CFG.ghostSpeed * dt);
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
        const p = B.graph.path(c, goal.pos);
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
        openCard({ kind: 'landmark', place: l, points: CFG.landmarkPts, hint });
        return;
      }
    }

    const t = state.task;
    if (Math.hypot(t.sx - gp[0], t.sy - gp[1]) < CFG.arriveDist) {
      const pts = taskPoints();
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
        if (added) ui.toast({ title: `${added.name} joined the hunt!`, body: added.desc + ' Everyone else lost your trail, for now.', kind: 'warn', secs: 6 });
        else ui.toast({ title: 'New task: find ' + state.task.name, body: 'The chompers lost your trail, for now. They’re faster this time.', kind: 'info', secs: 5 });
      };
      openCard({ kind: 'found', place: t, points: pts, cat: CAT[t.cat] });
      ui.setScore(state.score);
      return;
    }
    ui.setScore(state.score);
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
    fctx.clearRect(0, 0, W, H);
    if (!B || state.mode === 'lobby' || state.mode === 'loading') {
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
      if (near === 0) { B.nearTotal = undefined; startRun(); }
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
      if (off) PM.Sprites.edgeArrow(fctx, W, H, cz > 1 ? W - csx * DPR : csx * DPR, cz > 1 ? H - csy * DPR : csy * DPR, DPR, c.dist, c.color);
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

  // ---------- loop ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now += dt;
    if (state.mode === 'play') update(dt);
    try { draw(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }

  let lobby = [];
  function pick(id) {
    audio.unlock();
    loadBorough(id).catch((e) => {
      console.error(e);
      ui.showLoading('failed', 0, 'The map could not load: ' + e.message + '. Serve the folder over http (see README).');
    });
  }

  ui.init({
    onPick: pick,
    onAgain: () => { camPos = null; startRun(); },
    onLobby: () => { state.mode = 'lobby'; audio.stop(); ui.setHere(''); ui.showLobby(); },
    onResume: togglePause,
    onToggleMute: () => ui.setMuted(audio.toggleMute()),
    onCloseCard: closeCard,
    onRevisit: (i) => {
      if (state.mode !== 'play' && state.mode !== 'pause') return;
      if (state.mode === 'pause') ui.showPause(false);
      const it = state.passport[i];
      if (it) openCard({ kind: 'revisit', place: it.place, cat: it.kind === 'found' ? CAT[it.place.cat] : '' });
    },
  });
  fetchJSON('data/boroughs.json').then((list) => { lobby = list; ui.renderLobby(list); ui.showLobby(); })
    .catch((e) => ui.showLoading('the lobby', 0, 'Could not load the borough list: ' + e.message + '. Serve the folder over http (see README).'));
  requestAnimationFrame(frame);

  window.PM.debug = { state, CFG, get B() { return B; }, pick, startRun, closeCard,
    press: (d) => { queued = d; queuedAt = now; if (state.ghost) state.ghost.started = true; },
    hold: (d, on) => (on ? held.add(d) : held.delete(d)) };
})();
