// Tiger Data: game events go in (api/events -> pm_events hypertable); riddle stats (pm_riddle_hourly continuous
// aggregate) and "know the block" (767k NYC buildings) come out. Separate from cloud.js so the game still gets
// these when MongoDB is down, and vice versa. Everything fails quietly: the game never waits on it.
(function () {
  const PM = (window.PM = window.PM || {});
  let off = false; // no api/ here (plain static hosting) or no database configured

  const gone = (r) => { if (r.status === 404 || r.status === 503) off = true; return r; };
  async function get(path) {
    if (off) return null;
    try {
      const r = gone(await fetch('api/' + path));
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  PM.Tiger = {
    event(borough, place, kind, secs) {
      if (off || !place) return;
      fetch('api/events', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PM.Cloud ? PM.Cloud.id : 'anonymous-player', borough, place, kind, secs: secs == null ? null : Math.round(secs * 10) / 10 }),
      }).then(gone).catch(() => {});
    },
    riddle(place) { return get('riddle?place=' + encodeURIComponent(place)); },
    block(p) { return p && p.lat ? get(`block?lat=${p.lat}&lon=${p.lon}`) : Promise.resolve(null); },
  };
})();
