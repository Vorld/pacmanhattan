// Every finished game with its Passport (the places reached, in order).
//   POST /api/runs  single player: {playerId, mode:'solo', borough, score, tasks, time, passport:[{kind,name}]}
//                   two players:   {playerId, mode:'versus', borough, time, winner, reason, players:[{name, found, caught, passport}]}
//   GET  /api/runs?playerId=...[&limit=20] -> that browser's recent runs, newest first
import { getDb, send, handle, bad, body, query, playerId, borough, int, text, passport, touchPlayer } from './_lib/db.js';

export default handle(async (req, res) => {
  const db = await getDb();
  const col = db.collection('runs');
  if (req.method === 'GET') {
    const q = query(req);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    const runs = await col.find({ playerId: playerId(q.playerId) }, { projection: { _id: 0, playerId: 0 } })
      .sort({ createdAt: -1 }).limit(limit).toArray();
    return send(res, 200, { runs });
  }
  if (req.method === 'POST') {
    const d = body(req);
    const base = { playerId: playerId(d.playerId), borough: borough(d.borough), time: int(d.time || 0, 86_400, 'time'), createdAt: new Date() };
    let doc;
    if (d.mode === 'solo') {
      doc = { ...base, mode: 'solo', score: int(d.score, 10_000_000, 'score'), tasks: int(d.tasks, 10_000, 'tasks'), passport: passport(d.passport) };
    } else if (d.mode === 'versus') {
      if (!Array.isArray(d.players) || d.players.length !== 2) throw bad('versus needs 2 players');
      doc = { ...base, mode: 'versus', winner: d.winner == null ? null : text(d.winner, 40), reason: text(d.reason, 200),
        players: d.players.map((p) => ({ name: text(p && p.name, 40), found: int(p && p.found, 10_000, 'found'), caught: !!(p && p.caught), passport: passport(p && p.passport) })) };
    } else throw bad('mode must be solo or versus');
    await col.insertOne(doc);
    await touchPlayer(db, doc.playerId);
    return send(res, 201, { ok: true });
  }
  send(res, 405, { error: 'use GET or POST' });
});
