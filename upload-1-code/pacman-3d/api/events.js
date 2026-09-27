// Game events into Tiger Data, one row each in the pm_events hypertable.
//   POST /api/events {playerId, borough, place, kind, secs}
//   kind: solved (found before the name showed), found (after), revealed, landmark, caught
import { send, handle, bad, body, playerId, borough, text } from './_lib/db.js';
import { tiger } from './_lib/tiger.js';

const KINDS = new Set(['solved', 'found', 'revealed', 'landmark', 'caught']);

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
  const d = body(req);
  if (!KINDS.has(d.kind)) throw bad('bad kind');
  const place = text(d.place, 120);
  if (!place) throw bad('bad place');
  const secs = d.secs == null ? null : Number(d.secs);
  if (secs != null && !(secs >= 0 && secs < 86400)) throw bad('bad secs');
  await tiger().query('insert into pm_events (player, borough, place, kind, secs) values ($1, $2, $3, $4, $5)',
    [playerId(d.playerId), borough(d.borough), place, d.kind, secs]);
  send(res, 201, { ok: true });
});
