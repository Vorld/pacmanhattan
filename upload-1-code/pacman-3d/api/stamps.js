// Landmark stamps a player has collected, per map. Stamps only ever get added.
//   GET  /api/stamps?playerId=...                     -> { stamps: { manhattan: [...], brooklyn: [...] } }
//   POST /api/stamps {playerId, borough, names: [...]} -> adds them, returns that map's full list
import { getDb, send, handle, body, query, playerId, borough, names, touchPlayer } from './_lib/db.js';

export default handle(async (req, res) => {
  const db = await getDb();
  const col = db.collection('stamps');
  if (req.method === 'GET') {
    const id = playerId(query(req).playerId);
    const rows = await col.find({ playerId: id }).toArray();
    return send(res, 200, { stamps: Object.fromEntries(rows.map((r) => [r.borough, r.names])) });
  }
  if (req.method === 'POST') {
    const d = body(req);
    const id = playerId(d.playerId), b = borough(d.borough), add = names(d.names);
    const r = await col.findOneAndUpdate(
      { _id: `${id}:${b}` },
      { $addToSet: { names: { $each: add } }, $set: { playerId: id, borough: b, updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    );
    await touchPlayer(db, id);
    return send(res, 200, { borough: b, names: (r && (r.value || r).names) || add });
  }
  send(res, 405, { error: 'use GET or POST' });
});
