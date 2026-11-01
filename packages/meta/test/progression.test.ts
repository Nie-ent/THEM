import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, type ScoreBreakdown } from '@them/core';
import { buildRunConfig } from '../src/loadout';
import {
  MetaError, allocateStats, expToNext, grantExp, resetStats, runExpFor, statMods,
} from '../src/progression';
import { applyRunOutcome, type RunOutcome } from '../src/rewards';
import { freshProfile, unlimited } from './helpers';

const g = content.meta.globalLevel;
const worldId = content.worlds[0]!.id;

function outcome(grade: ScoreBreakdown['grade'], o: Partial<RunOutcome> = {}): RunOutcome {
  const band = content.balance.scoring.grades.find((b) => b.grade === grade)!;
  const waveCount = content.worlds[0]!.waves.length;
  return {
    runId: 'r', worldId, difficulty: 'normal', result: 'win', wavesCleared: waveCount, waveCount,
    score: {
      kills: { normal: 0, elite: 0, miniboss: 0, boss: 0 }, killPoints: 0, bossBonus: 0,
      mDifficulty: 1, mSpeed: 1, mDamage: 1, performance: 1, total: 0, grade, rewardPct: band.rewardPct,
    },
    ...o,
  };
}

describe('Global Level EXP table (GDD §12)', () => {
  it('is 20 × L^2.2 rounded, one entry per level below the cap', () => {
    expect(g.cap).toBe(50);
    expect(g.expToNext).toHaveLength(g.cap - 1);
    g.expToNext.forEach((v, i) => expect(Math.abs(v - 20 * Math.pow(i + 1, 2.2))).toBeLessThanOrEqual(0.5));
  });

  it('matches the GDD milestones: Lv 10 3,170 / Lv 35 ≈ 49,890 / Lv 49→50 ≈ 104,580', () => {
    expect(expToNext(content, 10)).toBe(3170);
    expect(Math.abs(expToNext(content, 35)! - 49890)).toBeLessThan(10);
    expect(Math.abs(expToNext(content, 49)! - 104580)).toBeLessThan(10);
    expect(expToNext(content, 50)).toBeNull();
  });

  it('pacing at grade A ≈ GDD: 45 runs to Lv 10, 980 to Lv 35, 2,230 to Lv 50 (±3%)', () => {
    const runsTo = (target: number) => {
      let p = freshProfile(), runs = 0;
      while (p.level < target) { p = grantExp(p, content, runExpFor(content, p.level, 1)).profile; runs++; }
      return runs;
    };
    for (const [lv, want] of [[10, 45], [35, 980], [50, 2230]] as const) {
      expect(Math.abs(runsTo(lv) - want) / want).toBeLessThan(0.03);
    }
  });
});

describe('grantExp', () => {
  it('levels up, keeps the remainder, and grants stat + trait points per level', () => {
    const r = grantExp(freshProfile(), content, 20 + 92 + 5); // Lv1→2 (20), Lv2→3 (92), 5 left
    expect(r.levelsGained).toBe(2);
    expect(r.profile.level).toBe(3);
    expect(r.profile.exp).toBe(5);
    expect(r.profile.unspentStatPoints).toBe(2 * g.statPointsPerLevel);
    expect(r.profile.traits.unspentPoints).toBe(2 * g.traitPointsPerLevel);
  });

  it('stops at the cap and drops extra EXP', () => {
    const r = grantExp(freshProfile(), content, 10_000_000);
    expect(r.profile.level).toBe(g.cap);
    expect(r.profile.exp).toBe(0);
    expect(r.levelsGained).toBe(g.cap - 1);
    expect(grantExp(r.profile, content, 500).profile.level).toBe(g.cap);
  });

  it('ignores zero / negative / NaN and does not mutate the input', () => {
    const p = freshProfile();
    for (const a of [0, -5, Number.NaN]) expect(grantExp(p, content, a).profile).toBe(p);
    grantExp(p, content, 1000);
    expect(p.level).toBe(1);
  });
});

describe('stats', () => {
  const leveled = () => grantExp(freshProfile(), content, 20 + 92 + 224).profile; // Lv 4 → 9 points

  it('allocates points and rejects bad requests', () => {
    const p = leveled();
    const a = allocateStats(p, { strength: 4, vitality: 2 });
    expect(a.stats).toMatchObject({ strength: 4, vitality: 2, intellect: 0 });
    expect(a.unspentStatPoints).toBe(p.unspentStatPoints - 6);
    expect(() => allocateStats(p, { strength: 100 })).toThrow(MetaError);
    expect(() => allocateStats(p, { strength: 1.5 })).toThrow(/whole number/);
    expect(() => allocateStats(p, { strength: -1 })).toThrow(/whole number/);
    expect(() => allocateStats(p, { luck: 1 } as never)).toThrow(/unknown stat/);
    expect(allocateStats(p, {})).toBe(p);
  });

  it('turns points into capped run modifiers', () => {
    const p = allocateStats(leveled(), { strength: 3, agility: 2, vitality: 4 });
    const s = content.meta.stats;
    expect(statMods(p, content)).toEqual({
      damageMult: s.strength.damageMult! * 3,
      speedMult: s.agility.speedMult! * 2,
      critChance: s.agility.critChance! * 2,
      maxHpMult: s.vitality.maxHpMult! * 4,
      armorAdd: s.vitality.armorAdd! * 4,
    });
    const huge = { ...p, stats: { ...p.stats, intellect: 10_000 } };
    expect(statMods(huge, content).cooldownMult).toBe(-content.meta.statCaps.cooldownMult!);
  });

  it('flows through the loadout into the run (vitality → hero max HP)', () => {
    const p = allocateStats(leveled(), { vitality: 5 });
    const run = createRun(buildRunConfig(p, content, { worldId }), unlimited, 1);
    const want = content.balance.playerHero.hp * (1 + content.meta.stats.vitality.maxHpMult! * 5);
    expect(run.w.maxHp[run.hero]).toBeCloseTo(want, 6);
  });

  it('reset is free up to freeRespecUntilLevel, refused after', () => {
    const p = allocateStats(leveled(), { command: 3 });
    const back = resetStats(p, content);
    expect(back.stats.command).toBe(0);
    expect(back.unspentStatPoints).toBe(leveled().unspentStatPoints);
    const high = grantExp(p, content, 1_000_000).profile;
    expect(high.level).toBeGreaterThan(g.freeRespecUntilLevel);
    expect(() => resetStats(high, content)).toThrow(/free reset ends/);
  });
});

describe('account EXP from runs', () => {
  it('pays 50 + 20 × L at grade A, scaled by the grade %, and levels the profile', () => {
    const r = applyRunOutcome(freshProfile(), outcome('A'), content, 0);
    expect(r.rewards.exp).toBe(70); // 50 + 20 × 1
    expect(r.levelsGained).toBe(1); // 20 to Lv 2, 50 left (< 92)
    expect(r.profile.level).toBe(2);
    expect(r.profile.exp).toBe(50);
    expect(r.profile.unspentStatPoints).toBe(g.statPointsPerLevel);
    expect(applyRunOutcome(freshProfile(), outcome('S'), content, 0).rewards.exp).toBe(84); // 70 × 1.2
  });

  it('a loss pays the C band × waves cleared, like currencies', () => {
    const n = content.worlds[0]!.waves.length;
    const r = applyRunOutcome(freshProfile(), outcome('C', { result: 'lose', wavesCleared: 10 }), content, 0);
    expect(r.rewards.exp).toBe(Math.floor(70 * 0.6 * 10 / n));
  });

  it('a duplicate runId grants no EXP', () => {
    const first = applyRunOutcome(freshProfile(), outcome('A'), content, 0);
    const again = applyRunOutcome(first.profile, outcome('A'), content, 0);
    expect(again.applied).toBe(false);
    expect(again.levelsGained).toBe(0);
    expect(again.profile.exp).toBe(first.profile.exp);
  });
});
