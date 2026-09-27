// How hard a place's riddle is, across every player: read from the pm_riddle_hourly continuous aggregate.
//   GET /api/riddle?place=...  -> {finds, solved, avgSecs, caught}
import { send, handle, bad, query, text } from './_lib/db.js';
import { tiger } from './_lib/tiger.js';

export default handle(async (req, res) => {
  const place = text(query(req).place, 120);
  if (!place) throw bad('bad place');
  const { rows } = await tiger().query(
    `select coalesce(sum(finds), 0)::int as finds, coalesce(sum(solved), 0)::int as solved,
            round((sum(secs_sum) / nullif(sum(finds), 0))::numeric)::int as "avgSecs", coalesce(sum(caught), 0)::int as caught
       from pm_riddle_hourly where place = $1`, [place]);
  send(res, 200, rows[0]);
});
