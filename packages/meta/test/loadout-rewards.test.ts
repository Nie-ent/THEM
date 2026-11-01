import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, score, stateHash, step, NO_INPUT, type ScoreBreakdown } from '@them/core';
// Test-only: core's internal context, to spawn an enemy (as core's own tests do).
import { getCtx } from '../../core/src/sim';
import { buildLoadout, buildRunConfig, teamFor, type LoadoutContributor } from '../src/loadout';
import { REWARDED_RUNS_KEPT } from '../src/profile';
import { applyRunOutcome, computeRunRewards, outcomeFromRun, type RunOutcome } from '../src/rewards';
import { freshProfile } from './helpers';

const worldId = content.worlds[0]!.id;
const baseGold = content.worlds[0]!.rewards.gold!;

function scoreWith(grade: ScoreBreakdown['grade'], total = 1000): ScoreBreakdown {
  const band = content.balance.scoring.grades.find((g) => g.grade === grade)!;
  return {
    kills: { normal: 0, elite: 0, miniboss: 0, boss: 0 }, killPoints: 0, bossBonus: 0,
    mDifficulty: 1, mSpeed: 1, mDamage: 1, performance: 1, total, grade, rewardPct: band.rewardPct,
  };
}

function outcome(o: Partial<RunOutcome> & { grade?: ScoreBreakdown['grade'] } = {}): RunOutcome {
  const waveCount = content.worlds[0]!.waves.length;
  return {
    runId: 'r1', worldId, difficulty: 'normal', result: 'win', score: scoreWith(o.grade ?? 'A'),
    wavesCleared: waveCount, waveCount, ...o,
  };
}

describe('loadout → createRun', () => {
  it('a fresh profile plays exactly like Phase 1 (no loadout effect, same ally heroes)', () => {
    const cfg = buildRunConfig(freshProfile(), content, { worldId });
    expect(cfg.power).toBeUndefined();
    expect(cfg.loadout).toEqual({ mods: {} });
    // Same ids in the same order as core's default (order decides each hero's post).
    expect(cfg.allyHeroes).toEqual(content.heroes.filter((h) => h.defaultTeam).map((h) => h.id));
    const a = createRun({ worldId }, content, 11);
    const b = createRun(cfg, content, 11);
    for (let i = 0; i < 120; i++) { step(a, NO_INPUT); step(b, NO_INPUT); }
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('sums contributions per key, never sets power, and core applies them (through the limiter)', () => {
    const c1: LoadoutContributor = () => ({ mods: { damageMult: 0.1, armorAdd: 1 } });
    const c2: LoadoutContributor = () => ({ mods: { damageMult: 0.05, maxHpMult: 0.2 } });
    const p = freshProfile();
    const built = buildLoadout(p, content, [c1, c2]);
    expect(built.loadout.mods!.damageMult).toBeCloseTo(0.15, 12);
    expect(built.loadout.mods!.armorAdd).toBe(1);
    const cfg = buildRunConfig(p, content, { worldId, difficulty: 'hard' }, [c1, c2]);
    expect(cfg).toMatchObject({ worldId, difficulty: 'hard' });
    expect(cfg.power).toBeUndefined();
    const run = createRun(cfg, content, 1);
    const s = run.limiter.scale;
    expect(run.mods.damageMult).toBeCloseTo(1 + 0.15 * s, 12);
    expect(run.w.maxHp[run.hero]).toBeCloseTo(content.balance.playerHero.hp * (1 + 0.2 * s), 9);
  });

  it('team: only owned, known heroes, no duplicates, capped at maxTeamSize', () => {
    const p = freshProfile();
    p.heroes.team = ['mira', 'ghost', 'mira', 'brann'];
    expect(teamFor(p, content)).toEqual(['mira', 'brann']);
    p.heroes.owned = p.heroes.owned.filter((h) => h.heroId !== 'brann');
    expect(teamFor(p, content)).toEqual(['mira']);
  });

  it('rejects an unknown world', () => {
    expect(() => buildRunConfig(freshProfile(), content, { worldId: 'nowhere' })).toThrow(/unknown world/);
  });
});

describe('run rewards (grade reward %)', () => {
  it('pays the grade band percentage of the world base reward', () => {
    for (const g of content.balance.scoring.grades) {
      const r = computeRunRewards(outcome({ grade: g.grade }), content);
      expect(r.currencies.gold).toBe(Math.floor((baseGold * g.rewardPct) / 100));
    }
  });

  it('a loss pays the C band scaled by waves cleared (GDD §3)', () => {
    const n = content.worlds[0]!.waves.length;
    const r = computeRunRewards(outcome({ result: 'lose', grade: 'C', wavesCleared: 7 }), content);
    expect(r.factor).toBeCloseTo((0.6 * 7) / n, 12);
    expect(r.currencies.gold).toBe(Math.floor((baseGold * 0.6 * 7) / n));
    expect(computeRunRewards(outcome({ result: 'lose', grade: 'C', wavesCleared: 0 }), content).currencies.gold).toBe(0);
  });

  it('applies currencies and progress, immutably', () => {
    const p = freshProfile();
    const r = applyRunOutcome(p, outcome({ grade: 'S' }), content, 2_000_000_000_000);
    expect(r.applied).toBe(true);
    expect(r.profile.currencies.gold).toBe(Math.floor(baseGold * 1.2));
    expect(r.profile.totals).toEqual({ runs: 1, wins: 1, kills: 0 });
    expect(r.profile.worlds[worldId]).toEqual({ cleared: true, runs: 1, wins: 1, bestScore: 1000, bestGrade: 'S' });
    expect(r.profile.updatedAt).toBe(2_000_000_000_000);
    expect(p.currencies.gold).toBe(0);
    expect(p.worlds).toEqual({});
  });

  it('a loss counts the run but never sets cleared or bestGrade', () => {
    const r = applyRunOutcome(freshProfile(), outcome({ result: 'lose', grade: 'C', wavesCleared: 10 }), content, 0);
    expect(r.profile.worlds[worldId]).toMatchObject({ cleared: false, runs: 1, wins: 0, bestGrade: null });
  });

  it('keeps the best grade and score across runs', () => {
    let p = freshProfile();
    p = applyRunOutcome(p, { ...outcome({ grade: 'A' }), runId: 'a', score: scoreWith('A', 3000) }, content, 0).profile;
    p = applyRunOutcome(p, { ...outcome({ grade: 'B' }), runId: 'b', score: scoreWith('B', 1000) }, content, 0).profile;
    expect(p.worlds[worldId]).toMatchObject({ runs: 2, wins: 2, bestScore: 3000, bestGrade: 'A' });
  });

  it('the same runId is never paid twice; the id list stays bounded', () => {
    let p = freshProfile();
    const first = applyRunOutcome(p, outcome(), content, 0);
    const again = applyRunOutcome(first.profile, outcome(), content, 0);
    expect(again.applied).toBe(false);
    expect(again.profile).toBe(first.profile);
    for (let i = 0; i < REWARDED_RUNS_KEPT + 5; i++) p = applyRunOutcome(p, outcome({ runId: `r${i}` }), content, 0).profile;
    expect(p.rewardedRuns.length).toBe(REWARDED_RUNS_KEPT);
    expect(p.rewardedRuns.at(-1)).toBe(`r${REWARDED_RUNS_KEPT + 4}`);
  });
});

describe('outcomeFromRun', () => {
  it('throws before the run ends', () => {
    expect(() => outcomeFromRun(createRun({ worldId }, content, 1), 'x')).toThrow(/not ended/);
  });

  it('reads a lost run: result, C grade, waves cleared', () => {
    const run = createRun(buildRunConfig(freshProfile(), content, { worldId }), content, 3);
    step(run, { moveX: 0, moveY: 0, callWave: true });
    expect(run.phase).toBe('wave');
    // Same setup as core's systems tests: a raider on a 1-HP hero ends the run during wave 1.
    run.w.hp[run.hero] = 1;
    getCtx(run).spawnEnemy('raider', run.w.x[run.hero]! + 12, run.w.y[run.hero]! + 12);
    for (let i = 0; i < 30 * 30 && run.phase !== 'ended'; i++) step(run, NO_INPUT);
    expect(run.phase).toBe('ended');
    const o = outcomeFromRun(run, 'lost-1');
    expect(o).toMatchObject({ runId: 'lost-1', worldId, difficulty: 'normal', result: 'lose', wavesCleared: 0 });
    expect(o.score.grade).toBe(score(run).grade);
    expect(o.score.grade).toBe('C');
    expect(applyRunOutcome(freshProfile(), o, content, 0).profile.currencies.gold).toBe(0);
  });
});
