import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { distanceBand, gridDirection, hintForVisit, zoneOf } from '../src/engine/hints';
import { toXY } from '../src/engine/geo';
import { computeScore, targetBonus } from '../src/engine/scoring';
import { loadManhattan } from './helpers';

const { graph, places } = loadManhattan();
const byId = (id: string) => places.landmarks.find((l) => l.id === id)!;

describe('hints', () => {
  it('names zones and Manhattan directions correctly', () => {
    expect(zoneOf(toXY(-74.0113, 40.7069))).toMatch(/Lower Manhattan/);
    expect(zoneOf(toXY(-73.9855, 40.758))).toMatch(/Midtown/);
    expect(zoneOf(toXY(-73.9501, 40.81))).toMatch(/Harlem/);
    // Times Square -> Apollo is uptown; Times Square -> UN is crosstown east.
    expect(gridDirection(toXY(-73.9855, 40.758), toXY(-73.9501, 40.81))).toBe('uptown');
    expect(gridDirection(toXY(-73.9855, 40.758), toXY(-73.968, 40.7489))).toMatch(/east/);
    expect(distanceBand(750)).toBe('between 500 m and 1 km away');
  });

  it('reveals hints in sequence, each narrower than the last', () => {
    const target = places.targets.find((t) => t.id === 'katz')!;
    const kinds = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => hintForVisit(i, graph, target, byId('empire-state')).kind);
    expect(kinds).toEqual(['zone', 'bearing', 'neighborhood', 'fact', 'bearing', 'street', 'fact', 'bearing']);
    const facts = [3, 6].map((i) => hintForVisit(i, graph, target, byId('empire-state')).text);
    expect(facts).toEqual(target.facts);
    expect(hintForVisit(5, graph, target, byId('empire-state')).text).toMatch(/Houston|Ludlow/);
  });
});

describe('scoring', () => {
  it('pays more for targets found with fewer hints, with a floor', () => {
    const s = DEFAULT_CONFIG.scoring;
    expect(targetBonus(s, 1, 1)).toBeGreaterThan(targetBonus(s, 6, 1));
    expect(targetBonus(s, 50, 1)).toBe(s.targetMinBonus);
    expect(targetBonus(s, 0, 3)).toBeGreaterThan(targetBonus(s, 0, 1));
  });

  it('adds landmarks, survival time and target bonuses', () => {
    const s = { ...DEFAULT_CONFIG.scoring, pointsPerSecond: 1 };
    expect(computeScore(s, 100, 10.9, 1500)).toEqual({ landmarks: 100, survival: 10, target: 1500, total: 1610 });
  });
});
