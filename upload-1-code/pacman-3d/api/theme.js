// Themed runs: the player types a theme ("food spots", "first date in Brooklyn") and Gemini picks that run's
// targets from the places already in the game. Any name Gemini returns that isn't in the list it was sent is dropped,
// so it can't invent places. Key from the environment only (GEMINI_API_KEY).
//   POST /api/theme {theme, places:[{name, cat, where, fact}]} -> {title, picks:[name]}  (picks empty if nothing fits)
import { send, handle, bad, body, text } from './_lib/db.js';

const MODEL = 'gemini-3.1-flash-lite';

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is not set'), { status: 503 });
  const d = body(req);
  const theme = text(d.theme, 60).trim();
  if (!theme) throw bad('bad theme');
  if (!Array.isArray(d.places) || !d.places.length) throw bad('bad places');
  const places = d.places.slice(0, 200).map((p) => ({ name: text(p && p.name, 80), cat: text(p && p.cat, 30), where: text(p && p.where, 60), fact: text(p && p.fact, 160) })).filter((p) => p.name);
  const names = new Set(places.map((p) => p.name));
  const prompt = `Pac-Manhattan is a game where the player runs through real New York City streets to find places. The player asked for a themed run: "${theme}".\n`
    + 'From the list below, pick the 4 to 8 places that best fit that theme. Use the exact names from the list and nothing else. '
    + 'If fewer than 3 places really fit, return an empty list. Also write a short title for the run (at most 5 words, no numbers).\n'
    + places.map((p) => `- ${p.name} (${p.cat}${p.where ? ', ' + p.where : ''}): ${p.fact}`).join('\n')
    + '\nReply as JSON: {"title": "...", "picks": ["exact name", ...]}';
  // one retry: a slow or off-list answer shouldn't turn into "nothing fits"
  let out = {}, picks = [];
  for (let attempt = 0; attempt < 2 && picks.length < 3; attempt++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }),
      });
      if (!r.ok) { console.log('[theme] gemini', r.status); continue; }
      const j = await r.json();
      out = JSON.parse(j.candidates[0].content.parts[0].text);
      picks = [...new Set((Array.isArray(out.picks) ? out.picks : []).map((n) => String(n)).filter((n) => names.has(n)))].slice(0, 8);
      if (picks.length < 3) console.log('[theme] only', picks.length, 'usable picks for', JSON.stringify(theme));
    } catch (e) { console.log('[theme] failed:', e.message); }
  }
  const title = text(out.title, 40).replace(/\d/g, '').trim() || theme;
  send(res, 200, picks.length >= 3 ? { title, picks } : { title: null, picks: [] });
});
