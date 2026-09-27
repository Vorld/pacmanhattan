// Cloud saves: high scores, landmark stamps and each run's Passport go to MongoDB through api/.
// Everything is also kept in this browser, so the game plays the same when the server or database
// is unreachable; anything that fails to send is queued and retried on the next visit.
// A player is an anonymous id made once per browser (no sign-in).
(function () {
  const PM = (window.PM = window.PM || {});
  const store = PM.store;
  const ID_KEY = 'pacmanhattan.player.v1', QUEUE_KEY = 'pacmanhattan.pending.v1';

  let id = store.get(ID_KEY, null);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    store.set(ID_KEY, id);
  }
  let off = false; // no api/ here (plain static hosting) or no database configured: stop trying this visit

  async function call(method, path, data) {
    if (off) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch('api/' + path, {
        method, signal: ctl.signal,
        headers: data ? { 'Content-Type': 'application/json' } : undefined,
        body: data ? JSON.stringify(data) : undefined,
      });
      if (r.status === 404 || r.status === 503) { off = true; return null; }
      if (!r.ok) return { rejected: true };
      return await r.json();
    } catch (e) {
      return null; // offline or timed out
    } finally { clearTimeout(timer); }
  }

  // a POST that must not be lost: queued if the network fails, dropped only if the server rejects it
  async function send(path, data) {
    const r = await call('POST', path, data);
    if (r === null && !off) {
      const q = store.get(QUEUE_KEY, []);
      q.push({ path, data });
      store.set(QUEUE_KEY, q.slice(-100));
    }
    return r && !r.rejected ? r : null;
  }

  async function flush() {
    const q = store.get(QUEUE_KEY, []);
    if (!q.length) return;
    store.set(QUEUE_KEY, []);
    for (const it of q) await send(it.path, it.data);
  }

  PM.Cloud = {
    get id() { return id; },
    get on() { return !off; },

    // global top 10 for a map, plus this player's best: { top, best } or null
    async scores(borough) {
      const r = await call('GET', `scores?borough=${encodeURIComponent(borough)}&playerId=${id}`);
      return r && !r.rejected ? r : null;
    },
    // save a single-player score: { rank, top } or null
    submitScore(s) { return send('scores', { playerId: id, ...s }); },

    addStamps(borough, names) { return send('stamps', { playerId: id, borough, names }); },

    // merge this browser's stamps with the saved ones, both ways; true if this browser learned new ones
    async syncStamps(boroughs) {
      const r = await call('GET', `stamps?playerId=${id}`);
      if (!r || r.rejected) return false;
      const saved = r.stamps || {};
      let learned = false;
      for (const b of boroughs) {
        const local = PM.loadStamps(b), cloud = saved[b] || [];
        const merged = new Set([...local, ...cloud]);
        if (merged.size > local.size) { PM.saveStamps(b, merged); learned = true; }
        const missing = [...local].filter((n) => !cloud.includes(n));
        if (missing.length) this.addStamps(b, missing);
      }
      return learned;
    },

    // a finished game and its Passport (solo or versus)
    saveRun(run) { return send('runs', { playerId: id, ...run }); },

    // on page load: resend anything queued, then sync stamps; true if the lobby should re-render
    async start(boroughs) {
      await flush();
      return this.syncStamps(boroughs);
    },
  };
})();
