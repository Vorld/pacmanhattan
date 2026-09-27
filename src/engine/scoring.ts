import type { GameConfig } from './config';

export interface ScoreBreakdown {
  landmarks: number;
  survival: number;
  target: number;
  total: number;
}

/** Bonus for finding one target: fewer hints used and harder targets pay more. */
export function targetBonus(cfg: GameConfig['scoring'], hintsUsed: number, difficulty: number): number {
  const mult = cfg.difficultyMultiplier[String(difficulty)] ?? 1;
  return Math.round(Math.max(cfg.targetMinBonus, cfg.targetBaseBonus - cfg.hintPenalty * hintsUsed) * mult);
}

export function computeScore(
  cfg: GameConfig['scoring'],
  landmarkPoints: number,
  secondsSurvived: number,
  targetPoints: number,
): ScoreBreakdown {
  const survival = Math.floor(secondsSurvived * cfg.pointsPerSecond);
  return { landmarks: landmarkPoints, survival, target: targetPoints, total: landmarkPoints + survival + targetPoints };
}

export interface HighScore {
  score: number;
  date: string;
  /** Targets found in the run. Older saves only have `found`. */
  targets?: number;
  found?: boolean;
  target?: string;
  landmarks: number;
  seconds: number;
}

export const targetsInEntry = (s: HighScore) => s.targets ?? (s.found ? 1 : 0);

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
