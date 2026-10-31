import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import {
  computeScore, damageMultiplier, difficultyMultiplier, gradeFor, powerMultiplier, speedMultiplier,
} from '../src/scoring';

const s = content.balance.scoring;

describe('scoring (GDD §12)', () => {
  it('reproduces the GDD worked example: (1600 + 200 + 300 + 500) × 1.0 × 1.15 × 1.05 ≈ 3140', () => {
    // Pick inputs that give exactly M_speed = 1.15 and M_damage = 1.05.
    // M_damage = (0.7 + 0.3c)(1.2 − 0.4h): c = 1 → 1.0 × (1.2 − 0.4h) = 1.05 → h = 0.375
    const r = computeScore(s, {
      kills: { normal: 1600, elite: 40, miniboss: 3, boss: 0 },
      bossKilled: true, difficulty: 'normal', hardcoreRules: 0,
      standardTime: 1150, actualTime: 1000, coreHpFrac: 1, heroDamageFrac: 0.375,
    });
    expect(r.killPoints).toBe(2100);
    expect(r.bossBonus).toBe(500);
    expect(r.mSpeed).toBeCloseTo(1.15, 10);
    expect(r.mDamage).toBeCloseTo(1.05, 10);
    // 2600 × 1.2075 = 3139.5 exactly on paper; float gives 3139.4999… → 3139. GDD says "≈ 3,140".
    expect(Math.abs(r.total - 3140)).toBeLessThanOrEqual(1);
    expect(r.performance).toBeCloseTo(1.2075, 10);
    expect(r.grade).toBe('A'); // 1.15 ≤ 1.2075 < 1.40
  });

  it('grades by M_speed × M_damage bands', () => {
    expect(gradeFor(s, 1.4).grade).toBe('S');
    expect(gradeFor(s, 1.39).grade).toBe('A');
    expect(gradeFor(s, 1.15).grade).toBe('A');
    expect(gradeFor(s, 1.149).grade).toBe('B');
    expect(gradeFor(s, 0.9).grade).toBe('B');
    expect(gradeFor(s, 0.899).grade).toBe('C');
    expect(gradeFor(s, 0).grade).toBe('C');
    expect(gradeFor(s, 1.5).rewardPct).toBe(120);
    expect(gradeFor(s, 1.2).rewardPct).toBe(100);
    expect(gradeFor(s, 1.0).rewardPct).toBe(80);
    expect(gradeFor(s, 0.5).rewardPct).toBe(60);
  });

  it('M_speed clamps to 0.7–1.3', () => {
    expect(speedMultiplier(s, 1000, 100)).toBe(1.3);
    expect(speedMultiplier(s, 1000, 10_000)).toBe(0.7);
    expect(speedMultiplier(s, 1000, 1000)).toBe(1);
  });

  it('M_damage spans 0.56–1.2', () => {
    expect(damageMultiplier(s, 1, 0)).toBeCloseTo(1.2, 12);
    expect(damageMultiplier(s, 0, 1)).toBeCloseTo(0.56, 12);
    expect(damageMultiplier(s, 0.5, 0.5)).toBeCloseTo(0.85 * 1.0, 12);
  });

  it('difficulty: normal 1.0, hard 1.5, nightmare 2.5, +0.1 per hardcore rule, max 3.0', () => {
    expect(difficultyMultiplier(s, 'normal', 0)).toBe(1);
    expect(difficultyMultiplier(s, 'hard', 0)).toBe(1.5);
    expect(difficultyMultiplier(s, 'nightmare', 2)).toBeCloseTo(2.7, 12);
    expect(difficultyMultiplier(s, 'nightmare', 10)).toBe(3);
  });

  it('kill points: normal 1, elite 5, mini-boss 100; boss bonus 500 only when killed', () => {
    const base = { difficulty: 'normal' as const, hardcoreRules: 0, standardTime: 1, actualTime: 1, coreHpFrac: 1, heroDamageFrac: 0 };
    const a = computeScore(s, { ...base, kills: { normal: 10, elite: 2, miniboss: 1, boss: 0 }, bossKilled: false });
    expect(a.killPoints).toBe(120);
    expect(a.bossBonus).toBe(0);
    const b = computeScore(s, { ...base, kills: { normal: 0, elite: 0, miniboss: 0, boss: 1 }, bossKilled: true });
    expect(b.bossBonus).toBe(500);
  });
});

describe('difficulty limiter', () => {
  it('is linear below recommended and caps the bonus at +10% with diminishing returns', () => {
    expect(powerMultiplier(800, 1000, 0.1)).toBeCloseTo(0.8);
    expect(powerMultiplier(1000, 1000, 0.1)).toBe(1);
    const p = [1100, 1500, 2000, 5000, 100_000].map((x) => powerMultiplier(x, 1000, 0.1));
    for (let i = 1; i < p.length; i++) {
      expect(p[i]!).toBeGreaterThan(p[i - 1]!);
      expect(p[i]! - p[i - 1]!).toBeLessThan(p[i - 1]! - (i === 1 ? 1 : p[i - 2]!) + 1e-12);
    }
    for (const v of p) expect(v).toBeLessThan(1.1);
    expect(p[4]!).toBeGreaterThan(1.099);
    // +10% power gives less than +10%
    expect(p[0]!).toBeLessThan(1.1);
  });
});
