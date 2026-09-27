// High scores (single player), shared by everyone.
//   GET  /api/scores?borough=manhattan[&playerId=...]  -> top 10 for that map (+ that player's best)
//   POST /api/scores {playerId, initials, borough, score, tasks, landmarks, time} -> saves it, returns rank and top 10
import { getDb, send, handle, bad, body, query, playerId, borough, int, initials, touchPlayer } from './_lib/db.js';

const TOP = 10;
const top = (db, b) => db.collection('scores').find({ borough: b }, { projection: { _id: 0, playerId: 0 } })
  .sort({ score: -1, createdAt: 1 }).limit(TOP).toArray();

export default handle(async (req, res) => {
  const db = await getDb();
  if (req.method === 'GET') {
    const q = query(req);
    const b = borough(q.borough);
    const out = { top: await top(db, b) };
    if (q.playerId) {
      const best = await db.collection('scores').find({ borough: b, playerId: playerId(q.playerId) }, { projection: { _id: 0, playerId: 0 } })
        .sort({ score: -1 }).limit(1).toArray();
      out.best = best[0] || null;
    }
    return send(res, 200, out);
  }
  if (req.method === 'POST') {
    const d = body(req);
    const doc = {
      playerId: playerId(d.playerId), ini: initials(d.initials), borough: borough(d.borough),
      score: int(d.score, 10_000_000, 'score'), tasks: int(d.tasks, 10_000, 'tasks'),
      landmarks: int(d.landmarks || 0, 10_000, 'landmarks'), time: int(d.time || 0, 86_400, 'time'),
      createdAt: new Date(),
    };
    if (!doc.score) throw bad('score must be above 0');
    await db.collection('scores').insertOne(doc);
    await touchPlayer(db, doc.playerId, doc.ini);
    const rank = 1 + await db.collection('scores').countDocuments({ borough: doc.borough, score: { $gt: doc.score } });
    return send(res, 201, { rank, top: await top(db, doc.borough) });
  }
  send(res, 405, { error: 'use GET or POST' });
});
