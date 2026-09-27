// Pac-Manhattan: core game loop (3D).
(function () {
  const PM = window.PM;
  const D = window.PM_DATA;

  // ---------- tuning ----------
  const CFG = {
    ghostSpeed: 82,           // metres per game-second
    chomperBase: 0.80,        // x ghost speed at run start
    chomperPerTask: 0.065,    // added per completed task (passes 1.0 after ~3 tasks)
    chomperPerSec: 0.0012,    // added per second within a task
    chomperTimeCap: 0.10,
    chomperMax: 1.25,
    repathEvery: 0.3,         // seconds between chomper re-plans (reaction delay)
    catchDist: 18,
    arriveDist: 45,
    spawnMin: 900, spawnMax: 1800,   // chomper spawn path distance (m)
    taskMin: 900, taskMax: 4200,     // straight-line distance to next target (m)
    firstTaskMax: 2800,
    hintArrowSecs: 12,
    cursorDeadZone: 30,       // metres: cursor this close to the ghost = no steering
    taskBase: 1000, hintCost: 100, taskFloor: 400, streakBonus: 250, landmarkPts: 100,
  };
  const CAT = { R: 'Famous restaurant', M: 'Museum & culture', P: 'Park & public space', L: 'Monument & landmark' };
  const CAT_ICON = { R: '🍴', M: '🏛', P: '🌳', L: '🗽' };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // ---------- setup ----------
  if (D.map.q) {
    const k = 1 / D.map.q;
    for (const key of ['green', 'water', 'buildings']) D.map[key] = D.map[key].map((p) => Float32Array.from(p, (v) => v * k));
    D.map.q = 0;
  }
  const graph = new PM.Graph(D.graph);
  const canvas = document.getElementById('game');
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const world = new PM.World3D(canvas, D.map, graph);
  const ghost3d = new PM.Ghost3D(world.scene);
  const chomper3d = new PM.Chomper3D(world.scene);
  const arrow3d = new PM.HintArrow3D(world.scene);
  const audio = new PM.Audio();
  const ui = PM.UI;

  const places = (list) => list.map((p) => {
    const snap = graph.nearest(p.x, p.y, 800);
    return { ...p, pos: { e: snap.e, s: snap.s }, sx: snap.x, sy: snap.y };
  });
  const LANDMARKS = places(D.places.landmarks);
  const TARGETS = places(D.places.targets);
  world.addLandmarks(LANDMARKS);

  let W = 0, H = 0;
  function resize() {
    W = Math.floor(innerWidth * DPR); H = Math.floor(innerHeight * DPR);
    world.resize(innerWidth, innerHeight);
    world.w = W; world.h = H;
    fx.width = W; fx.height = H;
    fx.style.width = innerWidth + 'px'; fx.style.height = innerHeight + 'px';
  }
  addEventListener('resize', resize);
  resize();

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
      ev.preventDefault();
      held.add(d); queued = d; queuedAt = now; mouseActive = false;
      audio.unlock();
      if (state.mode === 'play' && !state.ghost.started) state.ghost.started = true;
      return;
    }
    if ((ev.code === 'KeyP' || ev.code === 'Escape') && (state.mode === 'play' || state.mode === 'pause')) togglePause();
    if (ev.code === 'KeyM') ui.setMuted(audio.toggleMute());
    if ((ev.code === 'Enter' || ev.code === 'Space') && state.mode === 'title') { ev.preventDefault(); startRun(); }
  });
  addEventListener('keyup', (ev) => { const d = KEYMAP[ev.code]; if (d) held.delete(d); });
  addEventListener('blur', () => { held.clear(); if (state.mode === 'play') togglePause(); });
  const onPointer = (ev) => {
    mouse = [ev.clientX, ev.clientY];
    if (state.mode === 'play') {
      mouseActive = true;
      if (!state.ghost.started && ev.type === 'pointerdown') { state.ghost.started = true; audio.unlock(); }
    }
  };
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerdown', (ev) => { onPointer(ev); if (state.mode === 'play' && !state.ghost.started) { state.ghost.started = true; audio.unlock(); } });

  // desired direction: keys first, else toward the cursor
  function wanted() {
    for (const d of ['up', 'down', 'left', 'right']) if (held.has(d)) return { v: DIRS[d], key: d };
    if (queued && now - queuedAt < 1.6) return { v: DIRS[queued], key: queued };
    if (mouseActive && mouse && state.ghost) {
      const p = world.groundAt(mouse[0], mouse[1]);
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
  function posXY(m) { return graph.pointAt(m.e, m.s); }

  function moveGhost(g, dist) {
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

  // ---------- run state ----------
  let now = 0;
  const state = { mode: 'title' };

  function startRun() {
    const start = LANDMARKS.find((l) => l.name === 'Times Square') || LANDMARKS[0];
    Object.assign(state, {
      mode: 'play', time: 0, score: 0, tasksDone: 0, taskTime: 0,
      visited: new Set([start.name]), used: new Set(), recentCats: [], route: [], routeTimer: 0,
      hint: null, fog: new Set(), cursorWorld: null,
    });
    world.resetMarkers();
    world.setVisited(start.name);
    const g = (state.ghost = { e: start.pos.e, s: start.pos.s, dir: 1, moving: false, started: false, anim: 0 });
    if (g.s < g.e.len / 2) { g.node = g.e.a; g.s = 0; } else { g.node = g.e.b; g.s = g.e.len; }
    queued = null; mouseActive = false;
    newTask(true);
    spawnChomper();
    ui.showHUD();
    ui.toast({ title: 'You are the ghost', body: 'Find ' + state.task.name + '. It glows gold when you get close. Visit ★ landmarks for hints.', kind: 'info', secs: 7 });
    audio.start();
  }

  function newTask(first) {
    const g = posXY(state.ghost);
    const far = (t, lo, hi) => { const d = Math.hypot(t.sx - g[0], t.sy - g[1]); return d >= lo && d <= hi; };
    const pool = TARGETS.filter((t) => !state.used.has(t.name) && !state.recentCats.includes(t.cat));
    let cands = pool.filter((t) => far(t, CFG.taskMin, first ? CFG.firstTaskMax : CFG.taskMax));
    if (!cands.length) cands = pool.filter((t) => far(t, CFG.taskMin, Infinity));
    if (!cands.length) { state.used.clear(); cands = TARGETS.filter((t) => far(t, CFG.taskMin, Infinity)); }
    const t = cands[Math.floor(Math.random() * cands.length)];
    state.task = t;
    state.used.add(t.name);
    state.recentCats.push(t.cat);
    if (state.recentCats.length > 2) state.recentCats.shift();
    state.taskHints = 0; state.taskTime = 0; state.hint = null; state.hintLog = [];
    world.setTarget(t);
    ui.setTask(t, CAT[t.cat], CAT_ICON[t.cat], state.tasksDone + 1);
    ui.setHints([]);
  }

  function spawnChomper() {
    const dist = graph.distancesFrom(state.ghost, CFG.spawnMax * 1.5);
    const cands = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= CFG.spawnMin && dist[i] <= CFG.spawnMax) cands.push(i);
    const n = cands.length ? cands[Math.floor(Math.random() * cands.length)] : Math.floor(Math.random() * dist.length);
    const e = graph.adj[n][0];
    state.chomper = { e, s: e.a === n ? 0 : e.len, dir: 1, path: [], repath: 0, mouth: 0, spawnFx: 1 };
  }

  function chomperFactor() {
    const t = Math.min(CFG.chomperTimeCap, state.taskTime * CFG.chomperPerSec);
    return Math.min(CFG.chomperMax, CFG.chomperBase + CFG.chomperPerTask * state.tasksDone + t);
  }

  function togglePause() {
    if (state.mode === 'play') { state.mode = 'pause'; ui.showPause(true); audio.pause(true); }
    else if (state.mode === 'pause') { state.mode = 'play'; ui.showPause(false); audio.pause(false); }
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
    const manhattan = (window.PM_BOROUGH || 'manhattan') !== 'brooklyn'; // Manhattan's grid is up in both other modes
    const ns = dy < 0 ? (manhattan ? 'uptown' : 'north') : (manhattan ? 'downtown' : 'south');
    const ew = dx > 0 ? 'east' : 'west';
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < ay * 0.35) return ns;
    if (ay < ax * 0.35) return 'to the ' + ew;
    return ns + ' & ' + ew;
  }

  function giveHint(landmark) {
    const t = state.task;
    const p = graph.path(state.ghost, t.pos);
    const miles = (p ? p.dist : Math.hypot(t.sx - landmark.sx, t.sy - landmark.sy)) / 1609.34;
    const txt = `${t.name} is ${miles < 0.1 ? 'under 0.1' : miles.toFixed(1)} mi away, ${describeDir(t.sx - landmark.sx, t.sy - landmark.sy)}.`;
    state.taskHints++;
    state.hint = { until: state.time + CFG.hintArrowSecs };
    state.hintLog.unshift({ from: landmark.name, text: txt });
    ui.setHints(state.hintLog);
    return txt;
  }

  function taskPoints() {
    return Math.max(CFG.taskFloor, CFG.taskBase - CFG.hintCost * state.taskHints) + CFG.streakBonus * state.tasksDone;
  }

  function gameOver() {
    state.mode = 'over';
    audio.chomp(); audio.stop();
    ui.hideHUD();
    ui.showGameOver({
      score: state.score, tasks: state.tasksDone, landmarkCount: state.visited.size - 1,
      time: state.time, target: state.task, route: state.route,
      map: D.map, graph, landmarks: LANDMARKS, visited: state.visited,
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

    const cx = Math.floor(gp[0] / 100), cy = Math.floor(gp[1] / 100);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 7) state.fog.add((cx + i) + ',' + (cy + j));
    state.routeTimer -= dt;
    if (state.routeTimer <= 0) { state.route.push(gp); state.routeTimer = 0.4; }

    const c = state.chomper;
    c.spawnFx = Math.max(0, c.spawnFx - dt);
    c.repath -= dt;
    if (c.repath <= 0) {
      const p = graph.path(c, g);
      c.path = p ? p.nodes : [];
      c.repath = CFG.repathEvery;
    }
    if (c.spawnFx <= 0) moveChomper(c, CFG.ghostSpeed * chomperFactor() * dt, g);
    c.mouth += dt * 10;
    const cp = posXY(c);
    const d = Math.hypot(cp[0] - gp[0], cp[1] - gp[1]);
    state.danger = d;
    audio.proximity(d);
    if (d < CFG.catchDist && c.spawnFx <= 0) { gameOver(); return; }

    for (const l of LANDMARKS) {
      if (state.visited.has(l.name)) continue;
      if (Math.hypot(l.sx - gp[0], l.sy - gp[1]) < CFG.arriveDist) {
        state.visited.add(l.name);
        world.setVisited(l.name);
        state.score += CFG.landmarkPts;
        const hint = giveHint(l);
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
      state.afterCard = () => {
        newTask(false);
        spawnChomper();
        ui.toast({ title: 'New task: find ' + state.task.name, body: 'The chomper lost your trail, for now. It’s faster this time.', kind: 'info', secs: 5 });
      };
      openCard({ kind: 'found', place: t, points: pts, cat: CAT[t.cat] });
      ui.setScore(state.score);
      return;
    }

    ui.setScore(state.score);
    ui.setStreet(g.e.name || (g.e.cls === 0 ? 'Park path' : ''), crossStreet(g));
  }

  function crossStreet(g) {
    const node = g.moving ? (g.dir > 0 ? g.e.b : g.e.a) : g.node;
    for (const e of graph.adj[node]) if (e.name && e.name !== g.e.name) return e.name;
    return '';
  }

  // ---------- draw ----------
  let camPos = null;
  const perf = { t: 0, n: 0 };
  function draw(dt) {
    const g = state.ghost;
    fctx.clearRect(0, 0, W, H);
    if (state.mode === 'title' || !g) {
      const a = now * 0.06;
      const focus = [Math.sin(a) * 900 + 200, -600 + Math.cos(a * 0.7) * 1400];
      world.updateGround(focus[0], focus[1], 1);
      world.updateBuildings(focus[0], focus[1], 8);
      world.render(focus, now, null);
      ghost3d.group.visible = false; chomper3d.group.visible = false;
      ui.setLoading(world.buildProgress);
      return;
    }
    ghost3d.group.visible = true; chomper3d.group.visible = true;
    const gp = posXY(g);
    // smooth camera follow
    if (!camPos) camPos = gp.slice();
    const k = 1 - Math.pow(0.0005, dt);
    camPos[0] += (gp[0] - camPos[0]) * k; camPos[1] += (gp[1] - camPos[1]) * k;
    if (Math.hypot(gp[0] - camPos[0], gp[1] - camPos[1]) > 600) camPos = gp.slice();

    world.updateGround(camPos[0], camPos[1], 2);
    world.updateBuildings(camPos[0], camPos[1], 5);

    const gh = g.moving ? graph.headingAt(g.e, g.s, g.dir) : null;
    ghost3d.update(gp[0], gp[1], gh, g.anim, state.danger < 220 && state.mode === 'play');
    const c = state.chomper;
    const cp = posXY(c);
    chomper3d.update(cp[0], cp[1], graph.headingAt(c.e, c.s, c.dir), Math.abs(Math.sin(c.mouth)), now, c.spawnFx);

    const t = state.task;
    if (state.hint && state.time < state.hint.until) {
      arrow3d.update(gp[0], gp[1], Math.atan2(t.sy - gp[1], t.sx - gp[0]), Math.min(1, (state.hint.until - state.time) / 2), now);
    } else arrow3d.update(0, 0, 0, 0, now);

    for (const [name, m] of world.markers) {
      const dd = Math.hypot(m.g.position.x - gp[0], m.g.position.z - gp[1]);
      m.sprite.visible = dd < 1100 && !m.visited;
    }

    world.render(camPos, now, gp);
    // drop shadows and resolution if the machine can't keep up
    if (state.mode === 'play' && !world.lowQ) {
      perf.t += dt; perf.n++;
      if (perf.t > 4) { if (perf.n / perf.t < 28) world.lowerQuality(); perf.t = 0; perf.n = 0; }
    }

    // 2D overlay: chomper pointer when off-screen, cursor target, danger vignette
    const [csx, csy, cz] = world.toScreen(cp[0], cp[1], 14);
    const off = cz > 1 || csx < 0 || csy < 0 || csx > innerWidth || csy > innerHeight;
    if (off) PM.Sprites.edgeArrow(fctx, W, H, cz > 1 ? W - csx * DPR : csx * DPR, cz > 1 ? H - csy * DPR : csy * DPR, DPR, state.danger);
    if (mouseActive && state.cursorWorld && state.mode === 'play') {
      const [mx, my] = world.toScreen(state.cursorWorld[0], state.cursorWorld[1]);
      fctx.strokeStyle = 'rgba(123,92,255,0.8)'; fctx.lineWidth = 2 * DPR;
      fctx.beginPath(); fctx.arc(mx * DPR, my * DPR, 12 * DPR, 0, Math.PI * 2); fctx.stroke();
    }
    if (state.danger < 320 && state.mode === 'play') {
      const a = (1 - state.danger / 320) * 0.45;
      const grd = fctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(255,40,40,0)'); grd.addColorStop(1, `rgba(255,40,40,${a})`);
      fctx.fillStyle = grd; fctx.fillRect(0, 0, W, H);
    }

    ui.showStartHint(!g.started && state.mode === 'play');
    ui.drawMinimap({ graph, map: D.map, fog: state.fog, ghost: gp, chomper: cp, landmarks: LANDMARKS, visited: state.visited, cam: camPos, viewW: 1100, viewH: 900 });
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now += dt;
    if (state.mode === 'play') update(dt);
    draw(dt);
    requestAnimationFrame(frame);
  }

  ui.init({
    onStart: () => { camPos = null; startRun(); },
    onResume: togglePause,
    onMenu: () => { state.mode = 'title'; ui.showTitle(); },
    onToggleMute: () => ui.setMuted(audio.toggleMute()),
    onCloseCard: closeCard,
  });
  ui.showTitle();
  requestAnimationFrame(frame);

  window.PM.debug = { state, graph, world, LANDMARKS, TARGETS, CFG, startRun, closeCard,
    press: (d) => { queued = d; queuedAt = now; if (state.ghost) state.ghost.started = true; },
    hold: (d, on) => (on ? held.add(d) : held.delete(d)) };
})();
