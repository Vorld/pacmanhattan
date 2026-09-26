import './style.css';
import { initAnalytics, nextRunIndex, track } from './analytics';
import { loadConfig, type GameConfig } from './engine/config';
import { SCREEN_DIRS, toLonLat } from './engine/geo';
import { StreetGraph, type GraphData } from './engine/graph';
import type { PlacesData } from './engine/places';
import { Run, type RunEvent } from './engine/run';
import { loadHighScores, saveHighScore, type HighScore } from './engine/scoring';
import { Sfx } from './ui/audio';
import { BaseMap } from './ui/basemap';
import { bindDirectionInput } from './ui/input';
import { Minimap } from './ui/minimap';
import { Overlay } from './ui/overlay';
import { RouteReplay } from './ui/replay';

const CITY = 'manhattan';
const FACT_CARD_MS = 8000;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface Game {
  config: GameConfig;
  graph: StreetGraph;
  places: PlacesData;
  base: BaseMap;
  overlay: Overlay;
  minimap: Minimap;
}

const sfx = new Sfx();
let game: Game | null = null;
let run: Run | null = null;
let paused = false;
let replay: RouteReplay | null = null;
let factTimer = 0;
let lastFrame = performance.now();

async function boot() {
  renderScores($('start-scores'), loadHighScores(CITY));
  try {
    const [config, graphData, places] = await Promise.all([
      loadConfig(),
      fetchJSON<GraphData>('data/manhattan-graph.json'),
      fetchJSON<PlacesData>('data/places.json'),
    ]);
    initAnalytics(config.analytics.endpoint);
    const graph = new StreetGraph(graphData);
    const base = await BaseMap.create($('map'), config, graph);
    game = {
      config,
      graph,
      places,
      base,
      overlay: new Overlay($<HTMLCanvasElement>('overlay'), base),
      minimap: new Minimap($<HTMLCanvasElement>('minimap'), graph),
    };
    const start = $<HTMLButtonElement>('start');
    start.disabled = false;
    start.textContent = 'Start run';
    start.focus();
  } catch (err) {
    console.error(err);
    const el = $('load-error');
    el.hidden = false;
    el.textContent = `Couldn't load the city data (${(err as Error).message}). Check your connection and reload.`;
  }
  requestAnimationFrame(frame);
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// --- Run lifecycle -----------------------------------------------------------

function startRun() {
  if (!game) return;
  sfx.unlock();
  sfx.start();
  replay?.stop();
  run = new Run(game.graph, game.places, game.config);
  run.on(onRunEvent);
  paused = false;

  for (const id of ['start-screen', 'end-screen', 'pause-screen', 'fact-card']) $(id).hidden = true;
  $('hud').hidden = false;
  $('clue').textContent = run.target.clue;
  $('hints').replaceChildren();
  $('no-hints').hidden = false;
  game.minimap.reset(run);
  flashBanner('RUN!', 1200);

  track('run_start', {
    city: CITY,
    target: run.target.id,
    difficulty: run.target.difficulty,
    runIndexInSession: nextRunIndex(),
  });
}

function onRunEvent(e: RunEvent) {
  if (!run) return;
  if (e.type === 'landmark') {
    sfx.landmark();
    showFactCard(e.landmark.name, e.landmark.neighborhood, e.landmark.fact, e.landmark.points, e.hint.text);
    const li = document.createElement('li');
    li.textContent = e.hint.text;
    li.className = 'fresh';
    $('hints').append(li);
    $('no-hints').hidden = true;
    const props = { landmark: e.landmark.id, t: Math.round(run.time), visitIndex: run.visited.length };
    track('landmark_visit', props);
    track('hint_shown', { ...props, kind: e.hint.kind, hintIndex: run.hints.length });
  } else {
    endRun(e.type);
  }
}

function endRun(outcome: 'caught' | 'found' | 'quit') {
  if (!run || !game) return;
  const r = run;
  const score = r.score;
  if (outcome === 'caught') sfx.caught();
  if (outcome === 'found') sfx.win();
  const summary = {
    target: r.target.id,
    t: Math.round(r.time),
    landmarks: r.visited.length,
    hints: r.hints.length,
    score: score.total,
  };
  if (outcome === 'caught') track('caught', summary);
  if (outcome === 'found') track('target_found', summary);

  const entry: HighScore = {
    score: score.total,
    date: new Date().toISOString(),
    found: outcome === 'found',
    target: r.target.name,
    landmarks: r.visited.length,
    seconds: Math.round(r.time),
  };
  const rank = saveHighScore(CITY, entry);

  // Let the final moment register before the end screen covers it.
  setTimeout(() => {
    $('hud').hidden = true;
    $('pause-screen').hidden = true;
    $('end-screen').hidden = false;
    $('end-title').textContent = outcome === 'found' ? 'YOU FOUND IT!' : outcome === 'caught' ? 'CHOMPED!' : 'RUN ENDED';
    $('end-sub').textContent =
      `The target was ${r.target.name} in ${r.target.neighborhood}: "${r.target.clue}"` +
      (outcome === 'found' ? ` Found with ${plural(r.hints.length, 'hint')}.` : '');
    $('bd-landmarks').textContent = `${score.landmarks}`;
    $('bd-survival-label').textContent = `Time survived (${formatTime(r.time)})`;
    $('bd-survival').textContent = `${score.survival}`;
    $('bd-target').textContent = outcome === 'found' ? `${score.target}` : '—';
    $('bd-total').textContent = `${score.total}`;
    $('end-landmarks').replaceChildren(
      ...(r.visited.length ? r.visited.map((l) => chip(l.name)) : [chip('None this time')]),
    );
    renderScores($('end-scores'), loadHighScores(CITY), rank);
    replay = new RouteReplay($<HTMLCanvasElement>('replay'), r);
    replay.play();
    $('again').focus();
  }, outcome === 'quit' ? 0 : 900);
}

function setPaused(p: boolean) {
  if (!run || run.status !== 'playing') return;
  paused = p;
  $('pause-screen').hidden = !p;
  if (p) $('resume').focus();
}

// --- Frame loop --------------------------------------------------------------

function frame(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game && run) {
    if (!paused) run.update(dt);
    const g = run.ghostPos;
    if (run.status === 'playing') game.base.follow(toLonLat(g.x, g.y));
    game.overlay.draw(run, now);
    game.minimap.draw(run);
    updateHud(run);
    if (run.status === 'playing' && !paused && run.pacmanActive) {
      sfx.danger(Math.max(0, 1 - run.pacmanDistance / game.config.warnDistance));
    }
  }
  requestAnimationFrame(frame);
}

function updateHud(r: Run) {
  $('score').textContent = String(r.score.total);
  $('time').textContent = formatTime(r.time);
  $('landmark-count').textContent = `${r.visited.length}/${r.places.landmarks.length}`;
  $('street').textContent = r.graph.edges[r.ghost.edge].name || '';
}

// --- HUD helpers -------------------------------------------------------------

function showFactCard(name: string, hood: string, fact: string, points: number, hint: string) {
  $('fact-name').textContent = name;
  $('fact-hood').textContent = hood;
  $('fact-text').textContent = fact;
  $('fact-points').textContent = `+${points}`;
  $('fact-hint').textContent = ` ${hint}`;
  const card = $('fact-card');
  card.hidden = false;
  // Restart the entrance animation.
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  clearTimeout(factTimer);
  factTimer = window.setTimeout(() => (card.hidden = true), FACT_CARD_MS);
}

function flashBanner(text: string, ms: number) {
  const el = $('countdown');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), ms);
}

function renderScores(list: HTMLElement, scores: HighScore[], highlight = -1) {
  if (!scores.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No runs yet. Be the first ghost on the board.';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(
    ...scores.map((s, i) => {
      const li = document.createElement('li');
      if (i === highlight) li.className = 'new';
      const label = document.createElement('span');
      label.textContent = `${s.found ? '★ ' : ''}${s.target} · ${formatTime(s.seconds)}`;
      const b = document.createElement('b');
      b.textContent = String(s.score);
      li.append(label, b);
      return li;
    }),
  );
}

const chip = (text: string) => {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatTime(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// --- Wiring ------------------------------------------------------------------

bindDirectionInput($('app'), (dir) => {
  if (run?.status === 'playing' && !paused) run.queueTurn(SCREEN_DIRS[dir]);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
  if (e.code === 'KeyM') toggleMute();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

function toggleMute() {
  $('mute').classList.toggle('off', sfx.toggleMute());
}
$('mute').classList.toggle('off', sfx.muted);
$('mute').addEventListener('click', toggleMute);
$('pause').addEventListener('click', () => setPaused(true));
$('resume').addEventListener('click', () => setPaused(false));
$('quit').addEventListener('click', () => {
  if (run?.status === 'playing') {
    paused = false;
    run.quit();
    endRun('quit');
  }
});
$('start').addEventListener('click', startRun);
$('again').addEventListener('click', startRun);
$('replay-btn').addEventListener('click', () => replay?.play());
$('zoom-in').addEventListener('click', () => game?.base.zoomBy(0.5));
$('zoom-out').addEventListener('click', () => game?.base.zoomBy(-0.5));

void boot();
