/** QA-P2-003: item rewards round stochastically per run instead of flooring. */
import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import type { ScoreBreakdown } from '@them/core';
import { applyRunOutcome, computeRunRewards, stochasticRound, type RunOutcome } from '../src/rewards';
import { freshProfile } from './helpers';

const world = content.worlds[0]!;
const items = world.rewardItems;
const ids = Object.keys(items).filter((k) => items[k]! > 0);
const pctOf = (g: ScoreBreakdown['grade']) => content.balance.scoring.grades.find((x) => x.grade === g)!.rewardPct;

function outcome(runId: string, grade: ScoreBreakdown['grade'], result: 'win' | 'lose' = 'win', wavesCleared = world.waves.length): RunOutcome {
  return {
    runId, worldId: world.id, difficulty: 'normal', result, wavesCleared, waveCount: world.waves.length,
    score: {
      kills: { normal: 0, elite: 0, miniboss: 0, boss: 0 }, killPoints: 0, bossBonus: 0,
      mDifficulty: 1, mSpeed: 1, mDamage: 1, performance: 1, total: 100, grade, rewardPct: pctOf(grade),
    },
  };
}

function average(make: (i: number) => RunOutcome, n = 4000): Record<string, number> {
  const sum: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = computeRunRewards(make(i), content);
    for (const id of ids) sum[id] = (sum[id] ?? 0) + r.items[id]!;
  }
  return Object.fromEntries(ids.map((id) => [id, sum[id]! / n]));
}

describe('item reward rounding (QA-P2-003)', () => {
  it('stochasticRound pays the fraction as a probability', () => {
    expect(stochasticRound(2.4, 0.39)).toBe(3);
    expect(stochasticRound(2.4, 0.41)).toBe(2);
    expect(stochasticRound(3, 0)).toBe(3);
  });

  it('expected items match base × grade factor; every win pays at least 1', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const g of ['S', 'A', 'B'] as const) {
      const a = average((i) => outcome(`w${g}${i}`, g));
      for (const id of ids) expect(a[id]!, `${g} ${id}`).toBeCloseTo(Math.max(1, (items[id]! * pctOf(g)) / 100), 1);
    }
    for (let i = 0; i < 300; i++) {
      const r = computeRunRewards(outcome(`c${i}`, 'C'), content);
      for (const id of ids) expect(r.items[id]!, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('S pays more than A on average', () => {
    const s = average((i) => outcome(`s${i}`, 'S'));
    const a = average((i) => outcome(`s${i}`, 'A'));
    const sum = (r: Record<string, number>) => Object.values(r).reduce((x, y) => x + y, 0);
    expect(sum(s)).toBeGreaterThan(sum(a) + 0.2);
  });

  it('an early loss still pays items in expectation (wave 11 of 20)', () => {
    const l = average((i) => outcome(`l${i}`, 'C', 'lose', 10));
    for (const id of ids) {
      expect(l[id]!, id).toBeCloseTo((items[id]! * 0.6 * 10) / 20, 1);
      expect(l[id]!, id).toBeGreaterThan(0);
    }
  });

  it('is deterministic per runId (results preview = applied reward); integer amounts are exact', () => {
    const o = outcome('same-run', 'B');
    expect(computeRunRewards(o, content).items).toEqual(computeRunRewards(o, content).items);
    expect(applyRunOutcome(freshProfile(), o, content, 1).rewards.items).toEqual(computeRunRewards(o, content).items);
    expect(computeRunRewards(outcome('any', 'A'), content).items).toEqual(items);
  });
});
