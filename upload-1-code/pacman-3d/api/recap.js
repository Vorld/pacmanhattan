// "Postcard from your run": Gemini writes a short, funny recap of a finished run from the run's real facts,
// and ElevenLabs reads it aloud. Keys come only from the environment (GEMINI_API_KEY, ELEVENLABS_API_KEY).
// Every postcard is checked against the facts before it's used: any number, or any capitalized name, that
// isn't in the facts gets it rejected (up to three tries), and a plain template is used instead.
//   POST /api/recap {facts:{borough, start, reached[], found[], target, milesFromTarget, street, seconds, caughtBy, score}, voice}
//   -> {text, source: 'gemini' | 'template', audio?: base64 mp3}
import { send, handle, bad, body, text } from './_lib/db.js';

const MODEL = 'gemini-3.1-flash-lite';
const VOICE = 'FGY2WhTYpPnrIDTdsKH5'; // Laura, same narrator as the shipped voice lines
const OK_WORDS = new Set(['you', 'your', 'new', 'york', 'city', 'nyc', 'ghost', 'pac', 'manhattan', 'brooklyn', 'queens', 'bronx',
  'staten', 'island', 'chomps', 'sneaky', 'snooze', 'chomper', 'chompers', 'passport', 'the', 'a', 'an', 'but', 'then', 'and', 'still',
  'sadly', 'alas', 'wow', 'oops', 'next', 'sorry', 'rest', 'here', 'meanwhile', 'finally', 'bravo', 'well', 'ah']);

function clean(f) {
  const list = (v) => (Array.isArray(v) ? v.slice(0, 40).map((x) => text(x, 80)).filter(Boolean) : []);
  const miles = f.milesFromTarget == null ? null : Number(f.milesFromTarget);
  const secs = Math.round(Number(f.seconds));
  if (!(secs >= 0 && secs < 86400)) throw bad('bad seconds');
  return {
    borough: text(f.borough, 40), start: text(f.start, 80), reached: list(f.reached), found: list(f.found),
    target: text(f.target, 80), milesFromTarget: Number.isFinite(miles) ? Math.round(miles * 10) / 10 : null,
    street: text(f.street, 80), seconds: secs, caughtBy: text(f.caughtBy, 20), score: Math.max(0, Math.round(Number(f.score) || 0)),
  };
}

const clock = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);

function template(f) {
  const places = f.reached.length ? `, reached ${f.reached.slice(-3).join(', ')}` : '';
  const near = f.milesFromTarget != null ? `, ${f.milesFromTarget} mi from ${f.target}` : '';
  return `You ran ${clock(f.seconds)} in ${f.borough}${places}, and ${f.caughtBy} caught you on ${f.street || 'a quiet street'}${near}.`;
}

// the postcard may only use names and numbers that are in the facts
function check(t, f) {
  const facts = JSON.stringify(f).toLowerCase() + ' ' + clock(f.seconds);
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).filter((n) => !facts.includes(n));
  if (nums.length) return `it uses numbers that are not in the facts (${nums.join(', ')})`;
  const words = t.replace(/(^|[.!?]\s+)[A-Z][\w'’-]*/g, '$1').match(/\b[A-Z][\w'’-]+/g) || [];
  const odd = words.filter((w) => !OK_WORDS.has(w.toLowerCase()) && !facts.includes(w.toLowerCase().replace(/['’]s$/, '')));
  if (odd.length) return `it names things that are not in the facts (${[...new Set(odd)].join(', ')})`;
  if (t.length > 320) return 'it is too long';
  return null;
}

async function gemini(prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(9000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } }),
  });
  if (!r.ok) throw new Error('gemini ' + r.status);
  const j = await r.json();
  return String(JSON.parse(j.candidates[0].content.parts[0].text).recap || '').trim();
}

async function speak(t) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: 'POST', signal: AbortSignal.timeout(9000),
    headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY, Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: t, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.45 } }),
  });
  if (!r.ok) throw new Error('elevenlabs ' + r.status);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
  const d = body(req);
  const f = clean(d.facts || {});
  let out = null, source = 'template';
  if (process.env.GEMINI_API_KEY) {
    const lines = [
      `Map: ${f.borough}`, `Started at: ${f.start}`,
      f.reached.length ? `Places reached, in order: ${f.reached.join(', ')}` : 'Places reached: none yet',
      f.found.length ? `Targets found: ${f.found.join(', ')}` : 'Targets found: none',
      `Was looking for: ${f.target}` + (f.milesFromTarget != null ? ` (still ${f.milesFromTarget} miles away)` : ''),
      `Caught on: ${f.street || 'a quiet street'}`, `Caught by: ${f.caughtBy}`, `Time survived: ${clock(f.seconds)}`, `Score: ${f.score}`,
    ];
    const prompt = 'You write a funny postcard for the end of a run in Pac-Manhattan, an arcade game where the player is a ghost '
      + 'running through real New York City streets while chompers chase them. Write it in second person, 2 short sentences, '
      + 'at most 40 words, playful like a sports commentator. Mention where they got caught and which chomper caught them.\n'
      + 'Use ONLY these facts, word for word where you use them; no other places, streets, people or numbers, and describe distance only in miles as given:\n'
      + lines.map((l) => '- ' + l).join('\n') + '\n'
      + 'Reply as JSON: {"recap": "..."}';
    let feedback = '';
    for (let i = 0; i < 3 && !out; i++) {
      try {
        const t = await gemini(prompt + feedback);
        const why = check(t, f);
        if (!why) { out = t; source = 'gemini'; } else { console.log('[recap] rejected:', why, '|', t); feedback = `\nYour last postcard was rejected because ${why}. Write a different one.`; }
      } catch (e) { console.log('[recap] gemini failed:', e.message); break; }
    }
  }
  if (!out) out = template(f);
  const result = { text: out, source };
  if (d.voice && process.env.ELEVENLABS_API_KEY) {
    try { result.audio = await speak(out); } catch (e) { /* text only */ }
  }
  send(res, 200, result);
});
