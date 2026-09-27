// GET /api/health: is the database reachable? Handy right after setting MONGODB_URI in Vercel.
import { getDb, send, handle } from './_lib/db.js';

export default handle(async (req, res) => {
  const db = await getDb();
  await db.command({ ping: 1 });
  send(res, 200, { ok: true, db: db.databaseName });
});
