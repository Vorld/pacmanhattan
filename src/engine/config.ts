// Tuning lives in public/config.json so balance changes need no code change.
// These defaults are used for any key the file omits (and in tests).
export interface GameConfig {
  ghostSpeed: number; // m/s
  pacman: {
    baseSpeed: number; // m/s at run start
    speedGainPerMinute: number;
    maxSpeed: number;
    reactionDelayMs: number; // Pac-Man chases where the ghost was this long ago
    repathIntervalMs: number;
    startGraceMs: number; // Pac-Man waits this long before moving
    spawnMinDistance: number; // meters (path distance) from the ghost
    spawnMaxDistance: number;
  };
  catchRadius: number; // meters
  warnDistance: number; // path meters at which proximity warnings start
  arrivalRadius: number; // meters from a place's node that counts as arrival
  discoveryRadius: number; // meters around the ghost revealed on the minimap
  targetSpawnMinDistance: number; // meters between ghost spawn and target
  targetSpawnMaxDistance: number;
  zoom: { min: number; max: number; initial: number };
  overview: {
    showTarget: boolean; // false restores hints-only play (target stays secret)
    viewMeters: number; // width of the area the overview map shows
  };
  scoring: {
    pointsPerSecond: number;
    targetBaseBonus: number;
    hintPenalty: number;
    targetMinBonus: number;
    difficultyMultiplier: Record<string, number>;
  };
  map: { styleUrl: string };
  analytics: { endpoint: string | null };
}

export const DEFAULT_CONFIG: GameConfig = {
  ghostSpeed: 48,
  pacman: {
    baseSpeed: 52,
    speedGainPerMinute: 3,
    maxSpeed: 62,
    reactionDelayMs: 700,
    repathIntervalMs: 350,
    startGraceMs: 2500,
    spawnMinDistance: 700,
    spawnMaxDistance: 1100,
  },
  catchRadius: 14,
  warnDistance: 400,
  arrivalRadius: 30,
  discoveryRadius: 140,
  targetSpawnMinDistance: 1500,
  targetSpawnMaxDistance: 3500,
  zoom: { min: 15, max: 17.5, initial: 16.3 },
  overview: { showTarget: true, viewMeters: 3000 },
  scoring: {
    pointsPerSecond: 2,
    targetBaseBonus: 1500,
    hintPenalty: 150,
    targetMinBonus: 300,
    difficultyMultiplier: { '1': 1, '2': 1.3, '3': 1.6 },
  },
  map: { styleUrl: 'https://tiles.openfreemap.org/styles/dark' },
  analytics: { endpoint: null },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function mergeConfig(overrides: DeepPartial<GameConfig>): GameConfig {
  const merge = (base: any, over: any): any => {
    if (over === undefined || over === null || typeof over !== 'object' || Array.isArray(over)) {
      return over === undefined ? base : over;
    }
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = merge(base?.[k], over[k]);
    return out;
  };
  return merge(DEFAULT_CONFIG, overrides);
}

export async function loadConfig(url = 'config.json'): Promise<GameConfig> {
  try {
    const res = await fetch(url);
    if (!res.ok) return DEFAULT_CONFIG;
    return mergeConfig(await res.json());
  } catch {
    return DEFAULT_CONFIG;
  }
}
