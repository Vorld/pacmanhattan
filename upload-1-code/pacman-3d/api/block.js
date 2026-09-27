// "Know the block": the residential buildings within about 150 m of a place, from the 767k-building NYC table in Tiger Data
// (NYC PLUTO lots joined with HPD data).
//   GET /api/block?lat=..&lon=..  -> {buildings, typicalYear, oldestYear, apartments}
import { handle, bad, query } from './_lib/db.js';
import { tiger } from './_lib/tiger.js';

export default handle(async (req, res) => {
  const q = query(req);
  const lat = Number(q.lat), lon = Number(q.lon);
  if (!(lat > 40.45 && lat < 40.95 && lon > -74.3 && lon < -73.65)) throw bad('not in New York City');
  const { rows } = await tiger().query(
    `select count(*)::int as buildings,
            percentile_disc(0.5) within group (order by year_built) filter (where year_built > 1700) as "typicalYear",
            min(year_built) filter (where year_built > 1700) as "oldestYear",
            coalesce(sum(res_units), 0)::int as apartments
       from buildings
      where lat between $1 - 0.00135 and $1 + 0.00135 and lon between $2 - 0.0018 and $2 + 0.0018`, [lat, lon]);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, s-maxage=86400'); // the buildings don't change during a game
  res.end(JSON.stringify(rows[0]));
});
