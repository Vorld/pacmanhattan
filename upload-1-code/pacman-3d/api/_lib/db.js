// Shared MongoDB access for the api/ functions. The connection string comes only from the
// MONGODB_URI environment variable (set in Vercel), never from the code or the browser.
// Files under api/_lib are helpers, not endpoints (Vercel skips names starting with _).
import { MongoClient } from 'mongodb';

const DB_NAME = process.env.MONGODB_DB || 'pacmanhattan';

// reuse one client across calls while a function instance stays warm
let clientPromise = globalThis._pmMongo;
let indexesReady = null;

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 503 });
  if (!clientPromise) {
    clientPromise = globalThis._pmMongo = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 }).connect();
    clientPromise.catch(() => { clientPromise = globalThis._pmMongo = null; });
  }
  const db = (await clientPromise).db(DB_NAME);
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection('scores').createIndex({ borough: 1, score: -1 }),
      db.collection('scores').createIndex({ playerId: 1, createdAt: -1 }),
      db.collection('stamps').createIndex({ playerId: 1 }),
      db.collection('runs').createIndex({ playerId: 1, createdAt: -1 }),
    ]).catch((e) => { indexesReady = null; throw e; });
  }
  await indexesReady;
  return db;
}

// ---------- request helpers ----------
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

export function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}

// run a handler, turning thrown errors into JSON responses
export function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', e.message);
      send(res, status, { error: status >= 500 && status !== 503 ? 'server error' : e.message });
    }
  };
}

export const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// ---------- validation (the browser is not trusted) ----------
export function playerId(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(v)) throw bad('bad playerId');
  return v;
}
export function borough(v) {
  if (typeof v !== 'string' || !/^[a-z]{2,20}$/.test(v)) throw bad('bad borough');
  return v;
}
export function int(v, max, name) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > max) throw bad('bad ' + name);
  return n;
}
export function initials(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 20) || '???';
}
export function text(v, max = 120) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').slice(0, max);
}
export function names(list, max = 500) {
  if (!Array.isArray(list)) throw bad('bad names');
  return [...new Set(list.slice(0, max).map((n) => text(n)).filter(Boolean))];
}
// a Passport: the places reached in one run, in order
export function passport(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 300).map((it) => ({ kind: it && it.kind === 'found' ? 'found' : 'landmark', name: text(it && it.name) })).filter((it) => it.name);
}

// remember each player (anonymous id from their browser) and when we last saw them
export async function touchPlayer(db, id, ini) {
  const set = { lastSeen: new Date() };
  if (ini) set.initials = ini;
  await db.collection('players').updateOne({ _id: id }, { $set: set, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}
