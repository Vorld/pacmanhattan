// Shared Tiger Data (TimescaleDB) access for the api/ functions. The connection string comes only from
// the TIGER_DATABASE_URL environment variable (set in Vercel), never from the code or the browser.
// Tables: pm_events (hypertable), pm_riddle_hourly (continuous aggregate), buildings (read-only). See sql/tiger.sql.
import pg from 'pg';

let pool = globalThis._pmTiger;

export function tiger() {
  const raw = process.env.TIGER_DATABASE_URL;
  if (!raw) throw Object.assign(new Error('TIGER_DATABASE_URL is not set'), { status: 503 });
  if (!pool) {
    // libpq semantics for sslmode=require: encrypted, like psql (node-pg otherwise demands full cert verification)
    const url = new URL(raw);
    url.searchParams.set('uselibpqcompat', 'true');
    pool = globalThis._pmTiger = new pg.Pool({ connectionString: url.toString(), max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  }
  return pool;
}
