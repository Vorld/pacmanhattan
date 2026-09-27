import './style.css';
import { initAnalytics, nextRunIndex, track } from './analytics';
import { loadConfig, type GameConfig } from './engine/config';
import { SCREEN_DIRS, toLonLat } from './engine/geo';
import { StreetGraph, type GraphData } from './engine/graph';
import type { PlacesData } from './engine/places';
import { Run, type RunEvent } from './engine/run';
import { loadHighScores, saveHighScore, targetsInEntry, type HighScore } from './engine/scoring';
import { Sfx } from './ui/audio';
import { BaseMap } from './ui/basemap';
import { bindDirectionInput } from './ui/input';
import { Minimap } from './ui/minimap';
import { formatMeters, Overlay } from './ui/overlay';
import { Overview } from './ui/overview';
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
  overview: Overview;
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
      overview: new Overview($<HTMLCanvasElement>('overview'), graph, config.overview.viewMeters, config.overview.showTarget),
    };
    $('legend-target').hidden = !config.overview.showTarget;
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
  showTarget(run);
  game.minimap.reset(run);
  flashBanner('RUN!', 1200);

  track('run_start', {
    city: CITY,
    target: run.target.id,
    difficulty: run.target.difficulty,
    runIndexInSession: nextRunIndex(),
  });
}

/** Clue panel for the current target, with its (fresh) hint list. */
function showTarget(r: Run) {
  $('target-label').textContent = `Target ${r.found.length + 1}`;
  $('clue').textContent = r.target.clue;
  $('hints').replaceChildren();
  $('no-hints').hidden = false;
}

function onRunEvent(e: RunEvent) {
  if (!run) return;
  if (e.type === 'found') {
    sfx.win();
    const { target, bonus, hintsUsed } = e.found;
    showFactCard({
      eyebrow: `Target ${run.found.length} found`,
      name: target.name,
      text: target.facts[0],
      points: bonus,
      footLabel: `Target ${run.found.length + 1}`,
      footText: e.next.clue,
    });
    showTarget(run);
    flashBanner(`TARGET ${run.found.length + 1}!`, 1400);
    track('target_found', {
      target: target.id,
      targetIndex: run.found.length,
      hints: hintsUsed,
      bonus,
      t: Math.round(run.time),
      next: e.next.id,
    });
  } else if (e.type === 'landmark') {
    sfx.landmark();
    showFactCard({
      eyebrow: e.landmark.neighborhood,
      name: e.landmark.name,
      text: e.landmark.fact,
      points: e.landmark.points,
      footLabel: 'New hint',
      footText: e.hint.text,
    });
    const li = document.createElement('li');
    li.textContent = e.hint.text;
    li.className = 'fresh';
    $('hints').append(li);
    $('no-hints').hidden = true;
    const props = { landmark: e.landmark.id, t: Math.round(run.time), visitIndex: run.visited.length };
    track('landmark_visit', props);
    track('hint_shown', { ...props, kind: e.hint.kind, hintIndex: run.hints.length });
  } else if (e.type === 'pacman') {
    sfx.alarm();
    // Let the target banner show first, then announce the new chaser.
    setTimeout(() => flashBanner(`PAC-MAN #${e.count} JOINS!`, 1600), 1400);
    track('pacman_spawn', { count: e.count, targetsFound: run.found.length, t: Math.round(run.time) });
  } else {
    endRun(e.type);
  }
}

function endRun(outcome: 'caught' | 'quit') {
  if (!run || !game) return;
  const r = run;
  const score = r.score;
  if (outcome === 'caught') {
    sfx.caught();
    track('caught', {
      target: r.target.id,
      targetsFound: r.found.length,
      t: Math.round(r.time),
      landmarks: r.visited.length,
      score: score.total,
    });
  }

  const entry: HighScore = {
    score: score.total,
    date: new Date().toISOString(),
    targets: r.found.length,
    landmarks: r.visited.length,
    seconds: Math.round(r.time),
  };
  const rank = saveHighScore(CITY, entry);

  // Let the final moment register before the end screen covers it.
  setTimeout(() => {
    $('hud').hidden = true;
    $('pause-screen').hidden = true;
    $('end-screen').hidden = false;
    $('end-title').textContent = outcome === 'caught' ? 'CHOMPED!' : 'RUN ENDED';
    $('end-sub').textContent =
      `You found ${plural(r.found.length, 'target')}. ` +
      `You were hunting ${r.target.name} in ${r.target.neighborhood}: "${r.target.clue}"`;
    $('bd-landmarks').textContent = `${score.landmarks}`;
    $('bd-survival-label').textContent = `Time survived (${formatTime(r.time)})`;
    $('bd-survival').textContent = `${score.survival}`;
    $('bd-target-label').textContent = `Targets found (${r.found.length})`;
    $('bd-target').textContent = r.found.length ? `${score.target}` : '—';
    $('end-targets').replaceChildren(
      ...(r.found.length ? r.found.map((f) => chip(`${f.target.name} +${f.bonus}`)) : [chip('None this time')]),
    );
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
    game.overlay.draw(run, now, game.config.overview.showTarget);
    game.minimap.draw(run);
    game.overview.draw(run, now);
    updateHud(run, game.config);
    if (run.status === 'playing' && !paused) {
      sfx.danger(Math.max(0, 1 - run.pacmanDistance / game.config.warnDistance));
    }
  }
  requestAnimationFrame(frame);
}

function updateHud(r: Run, config: GameConfig) {
  $('score').textContent = String(r.score.total);
  $('time').textContent = formatTime(r.time);
  $('landmark-count').textContent = `${r.visited.length}/${r.places.landmarks.length}`;
  $('street').textContent = r.graph.edges[r.ghost.edge].name || '';
  if (config.overview.showTarget) {
    const t = r.graph.nodePos(r.target.node);
    const g = r.ghostPos;
    $('target-distance').textContent = `Target ${r.found.length + 1} · ${formatMeters(Math.hypot(t.x - g.x, t.y - g.y))}`;
  }
}

// --- HUD helpers -------------------------------------------------------------

interface FactCard {
  eyebrow: string;
  name: string;
  text: string;
  points: number;
  footLabel: string;
  footText: string;
}

function showFactCard(card: FactCard) {
  $('fact-hood').textContent = card.eyebrow;
  $('fact-name').textContent = card.name;
  $('fact-text').textContent = card.text;
  $('fact-points').textContent = `+${card.points}`;
  $('fact-foot-label').textContent = card.footLabel;
  $('fact-hint').textContent = card.footText;
  const el = $('fact-card');
  el.hidden = false;
  // Restart the entrance animation.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(factTimer);
  factTimer = window.setTimeout(() => (el.hidden = true), FACT_CARD_MS);
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
      label.textContent = `${plural(targetsInEntry(s), 'target')} · ${formatTime(s.seconds)}`;
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
