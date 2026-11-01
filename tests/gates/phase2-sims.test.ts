/**
 * QA gate P2-11: Phase 2 meta progression against GDD §12, by simulation.
 *
 * - Gacha: 200,000 pulls through `rollStar` (the code `pull` uses): pity bounds always hold
 *   (no 5★ gap over 80, never 10 pulls without a 4★ or better), mean pulls per 5★ ≈ 41, 90% of
 *   5★ within 65 pulls, and 3★/2★/1★ keep their base proportions.
 * - Enhancement: 50,000 items from +10 to +15 using the content step table: ≈ 40 attempts without
 *   protection scrolls and ≈ 15 with a scroll on every attempt.
 * - Progression pacing at grade A, 24 runs a day (GDD: Lv 10 on day 2, Lv 35 ≈ day 41, Lv 50 ≈ day 93;
 *   VIP with EXP ×1.5 and 36 runs a day: day 1 / 18 / 41).
 * - Saves: every committed fixture of an older save version loads in the current build.
 *
 * Seeds are fixed, so the gate is deterministic.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';
import { Rng } from '../../packages/core/src/index';
import { effectiveRates, rollStar, type PityState } from '../../packages/meta/src/gacha';
import { MIGRATIONS, SAVE_VERSION } from '../../packages/meta/src/migrations';
import { Profile, newProfile } from '../../packages/meta/src/profile';
import { grantExp, runExpFor } from '../../packages/meta/src/progression';
import { decodeSave } from '../../packages/meta/src/save';
import { seededRolls } from '../../packages/meta/src/env';

describe('P2-11 gacha distribution (200,000 pulls)', () => {
  const PULLS = 200_000;
  const rolls = new Rng(20261101);
  const state: PityState = { pullsSince5: 0, pullsSince4: 0 };
  const count = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const gaps: number[] = [];
  let since5 = 0, since4 = 0, maxSince4 = 0, maxGap = 0;
  for (let i = 0; i < PULLS; i++) {
    const s = rollStar(content, state, rolls);
    count[s]++;
    since5++; since4++;
    if (s >= 4) { maxSince4 = Math.max(maxSince4, since4); since4 = 0; }
    if (s === 5) { gaps.push(since5); maxGap = Math.max(maxGap, since5); since5 = 0; }
  }
  gaps.sort((a, b) => a - b);

  it('hard pity: a 5★ by pull 80, always; a 4★ or better within every 10 pulls', () => {
    expect(maxGap).toBeLessThanOrEqual(content.gacha.pity.hard);
    expect(maxSince4).toBeLessThanOrEqual(content.gacha.pity.guarantee4Every);
  });

  it('5★ every ≈ 41 pulls on average, 90% within 65 (GDD §12)', () => {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(42.5);
    const p90 = gaps[Math.floor(gaps.length * 0.9)]!;
    expect(p90).toBeGreaterThanOrEqual(63);
    expect(p90).toBeLessThanOrEqual(67);
  });

  it('the real rates shown in the Summon tab (effectiveRates) match the simulation within 0.3 points', () => {
    const real = effectiveRates(content);
    for (const s of [1, 2, 3, 4, 5] as const) expect(Math.abs(count[s] / PULLS - real[s])).toBeLessThan(0.003);
  });

  it('4★ at least the base 10% (the guarantee only adds); 3★ / 2★ / 1★ keep base proportions', () => {
    expect(count[4] / PULLS).toBeGreaterThanOrEqual(content.gacha.rates['4']! - 0.002);
    const low = count[1] + count[2] + count[3];
    const base = content.gacha.rates['1']! + content.gacha.rates['2']! + content.gacha.rates['3']!;
    for (const s of [1, 2, 3] as const) {
      const want = content.gacha.rates[String(s) as '1']! / base;
      expect(Math.abs(count[s] / low - want)).toBeLessThan(0.005);
    }
  });
});

describe('P2-11 enhancement +10 → +15 (50,000 items each)', () => {
  const steps = content.gear.enhance.steps;
  function attempts(protect: boolean, seed: number): number {
    const r = new Rng(seed);
    const N = 50_000;
    let total = 0;
    for (let t = 0; t < N; t++) {
      let level = 10;
      while (level < content.gear.enhance.maxLevel) {
        const s = steps[level]!;
        total++;
        if (r.float() < s.chance) level++;
        else if (!protect && s.dropChance > 0 && r.float() < s.dropChance) level--;
      }
    }
    return total / N;
  }
  it('≈ 40 attempts without protection scrolls (GDD §12)', () => {
    expect(Math.abs(attempts(false, 1) - 40) / 40).toBeLessThan(0.04);
  });
  it('≈ 15 attempts with a scroll on every attempt (GDD §12)', () => {
    expect(Math.abs(attempts(true, 2) - 15) / 15).toBeLessThan(0.05);
  });
});

describe('P2-11 progression pacing at grade A (GDD §12)', () => {
  /** Day (1-based) on which each target Global Level is reached. */
  function days(runsPerDay: number, expMult: number): Record<number, number> {
    let p = newProfile(content, { now: () => 0, rolls: seededRolls(1) });
    const out: Record<number, number> = {};
    let runs = 0;
    for (const target of [10, 35, 50]) {
      while (p.level < target) {
        p = grantExp(p, content, Math.floor(runExpFor(content, p.level, 1) * expMult)).profile;
        runs++;
      }
      out[target] = Math.ceil(runs / runsPerDay);
    }
    return out;
  }
  it('regular player, 24 runs a day: Lv 10 day 2, Lv 35 ≈ day 41, Lv 50 ≈ day 93 (±2 days)', () => {
    const d = days(24, 1);
    expect(d[10]).toBe(2);
    expect(Math.abs(d[35]! - 41)).toBeLessThanOrEqual(2);
    expect(Math.abs(d[50]! - 93)).toBeLessThanOrEqual(2);
  });
  it('VIP (EXP ×1.5, 36 runs a day): Lv 10 day 1, Lv 35 ≈ day 18, Lv 50 ≈ day 41 (±2 days)', () => {
    const d = days(36, 1.5);
    expect(d[10]).toBe(1);
    expect(Math.abs(d[35]! - 18)).toBeLessThanOrEqual(2);
    expect(Math.abs(d[50]! - 41)).toBeLessThanOrEqual(2);
  });
});

describe('P2-11 save migrations', () => {
  const dir = new URL('../../packages/meta/test/fixtures/', import.meta.url);
  const fixtures = readdirSync(dir).filter((f) => /^save-v\d+\.json$/.test(f));

  it('the migration chain covers every version below the current one', () => {
    expect(MIGRATIONS.map((m) => m.from).sort((a, b) => a - b)).toEqual(Array.from({ length: SAVE_VERSION - 1 }, (_, i) => i + 1));
  });

  it('there is a real fixture for every older version, and each loads in this build', () => {
    const versions = fixtures.map((f) => Number(/v(\d+)/.exec(f)![1])).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: SAVE_VERSION - 1 }, (_, i) => i + 1));
    for (const f of fixtures) {
      const r = decodeSave(readFileSync(new URL(f, dir), 'utf8'));
      expect(r.status, f).toBe('ok');
      if (r.status === 'ok') expect(Profile.safeParse(r.profile).success, f).toBe(true);
    }
  });
});
