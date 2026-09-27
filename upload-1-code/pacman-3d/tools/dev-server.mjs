// Local server for development: serves the game and runs the api/ functions like Vercel does.
//
//   cd upload-1-code/pacman-3d && npm install
//   put MONGODB_URI=... in .env.local (ignored by git), then: npm run dev   # open http://localhost:5173
//
// PORT changes the port. Without MONGODB_URI the game still runs; saving just falls back to this browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

async function api(req, res, name) {
  const file = path.join(root, 'api', name + '.js');
  if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"no such endpoint"}'); }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
  req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const mod = await import(pathToFileURL(file).href);
  await mod.default(req, res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const m = url.pathname.match(/^\/api\/([^/]+)$/);
    if (m) return await api(req, res, m[1]);
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); // always serve the latest files while developing
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"server error"}'); }
  }
}).listen(port, () => console.log(`Pac-Manhattan on http://localhost:${port}  (MongoDB ${process.env.MONGODB_URI ? 'on' : 'off: MONGODB_URI not set'})`));
