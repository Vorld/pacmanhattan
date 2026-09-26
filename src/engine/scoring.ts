import type { GameConfig } from './config';

export interface ScoreBreakdown {
  landmarks: number;
  survival: number;
  target: number;
  total: number;
}

export function computeScore(
  cfg: GameConfig['scoring'],
  landmarkPoints: number,
  secondsSurvived: number,
  found: boolean,
  hintsUsed: number,
  difficulty: number,
): ScoreBreakdown {
  const survival = Math.floor(secondsSurvived * cfg.pointsPerSecond);
  let target = 0;
  if (found) {
    const mult = cfg.difficultyMultiplier[String(difficulty)] ?? 1;
    target = Math.round(Math.max(cfg.targetMinBonus, cfg.targetBaseBonus - cfg.hintPenalty * hintsUsed) * mult);
  }
  return { landmarks: landmarkPoints, survival, target, total: landmarkPoints + survival + target };
}

export interface HighScore {
  score: number;
  date: string;
  found: boolean;
  target: string;
  landmarks: number;
  seconds: number;
}

const MAX_SCORES = 10;
const key = (city: string) => `pacmanhattan.highscores.${city}`;

export function loadHighScores(city: string): HighScore[] {
  try {
    const raw = localStorage.getItem(key(city));
    return raw ? (JSON.parse(raw) as HighScore[]) : [];
  } catch {
    return [];
  }
}

/** Saves the entry and returns its 0-based rank, or -1 if it didn't place. */
export function saveHighScore(city: string, entry: HighScore): number {
  const list = [...loadHighScores(city), entry].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
  try {
    localStorage.setItem(key(city), JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode); scores just won't persist.
  }
  return list.indexOf(entry);
}
