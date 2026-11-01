import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { NO_INPUT, createRun, step, type ScoreBreakdown } from '@them/core';
// Test-only: core's internal context, to spawn an enemy (as core's own tests do).
import { getCtx } from '../../core/src/sim';
import { setClass } from '../src/classes';
import { buildRunConfig } from '../src/loadout';
import { SAVE_VERSION } from '../src/migrations';
import { Profile, checkMetaContent } from '../src/profile';
import { MetaError } from '../src/progression';
import { applyRunOutcome, outcomeFromRun, type RunFacts, type RunOutcome } from '../src/rewards';
import { KeyValueSaveService, decodeSave, memoryStore } from '../src/save';
import { checkTitlesContent, countedTitles, equipTitle, titleLoadout, unlockTitles } from '../src/titles';
import { freshProfile } from './helpers';

const worldId = content.worlds[0]!.id;
const n = content.worlds[0]!.waves.length;
const T = content.titles;

let seq = 0;
function outcome(o: { grade?: ScoreBreakdown['grade']; result?: 'win' | 'lose'; facts?: RunFacts; difficulty?: RunOutcome['difficulty']; kills?: number } = {}): RunOutcome {
  const grade = o.grade ?? 'B';
  const band = content.balance.scoring.grades.find((g) => g.grade === grade)!;
  return {
    runId: `t${seq++}`, worldId, difficulty: o.difficulty ?? 'normal', result: o.result ?? 'win', wavesCleared: n, waveCount: n,
    score: {
      kills: { normal: o.kills ?? 0, elite: 0, miniboss: 0, boss: 0 }, killPoints: 0, bossBonus: 0,
      mDifficulty: 1, mSpeed: 1, mDamage: 1, performance: 1, total: 100, grade, rewardPct: band.rewardPct,
    },
    facts: o.facts ?? { heroDamageFrac: 0.5, coreHpFrac: 0.5, allies: 2 },
  };
}
const record = (p: Profile, o: RunOutcome) => applyRunOutcome(p, o, content, 0);

describe('titles content (GDD §7)', () => {
  it('passes the cross-checks; GDD example "unscarred" exists with +5% speed', () => {
    expect(checkTitlesContent(content)).toEqual([]);
    expect(checkMetaContent(content)).toEqual([]);
    expect(T.titles.find((t) => t.id === 'unscarred')?.mods).toEqual({ speedMult: 0.05 });
    expect(T.titles.length).toBeGreaterThanOrEqual(10);
  });
});

describe('earning titles', () => {
  it('a plain win unlocks the world title only', () => {
    const r = record(freshProfile(), outcome());
    expect(r.newTitles).toEqual(['garroth-victor']);
    expect(r.profile.titles.unlocked).toEqual(['garroth-victor']);
  });

  it('a loss unlocks no run title', () => {
    expect(record(freshProfile(), outcome({ result: 'lose', grade: 'C' })).newTitles).toEqual([]);
  });

  it('run conditions: grade S, flawless, solo, Core intact, nightmare', () => {
    const r = record(freshProfile(), outcome({ grade: 'S', difficulty: 'nightmare', facts: { heroDamageFrac: 0.02, coreHpFrac: 1, allies: 0 } }));
    expect(new Set(r.newTitles)).toEqual(new Set(['garroth-victor', 'unscarred', 'spotless', 'lone-survivor', 'unbroken-wall', 'nightmare-walker']));
    const miss = record(freshProfile(), outcome({ grade: 'A', facts: { heroDamageFrac: 0.06, coreHpFrac: 0.99, allies: 1 } }));
    expect(miss.newTitles).toEqual(['garroth-victor']);
  });

  it('a run without facts cannot earn fact-based titles', () => {
    const o = { ...outcome({ facts: { heroDamageFrac: 0, coreHpFrac: 1, allies: 0 } }) };
    delete o.facts;
    expect(record(freshProfile(), o).newTitles).toEqual(['garroth-victor']);
  });

  it('profile conditions: lifetime kills, runs, level, class', () => {
    let p = record(freshProfile(), outcome({ kills: 10_000 })).profile;
    expect(p.totals.kills).toBe(10_000);
    expect(p.titles.unlocked).toContain('thousand-fallen');
    p = { ...p, totals: { ...p.totals, runs: 99 } };
    expect(record(p, outcome({ result: 'lose', grade: 'C' })).newTitles).toContain('hardened');
    const classed = setClass({ ...freshProfile(), level: 35 }, content, 'warrior');
    expect(unlockTitles(classed, content).unlocked).toEqual(['no-longer-apprentice', 'veteran']);
  });

  it('unlockTitles returns the same profile when nothing is new', () => {
    const p = freshProfile();
    expect(unlockTitles(p, content).profile).toBe(p);
  });

  it('outcomeFromRun facts come from the run (hero damage, Core HP, allies)', () => {
    const run = createRun(buildRunConfig(freshProfile(), content, { worldId }), content, 1);
    step(run, { moveX: 0, moveY: 0, callWave: true });
    run.w.hp[run.hero] = 1;
    getCtx(run).spawnEnemy('raider', run.w.x[run.hero]! + 12, run.w.y[run.hero]! + 12);
    for (let i = 0; i < 30 * 30 && run.phase !== 'ended'; i++) step(run, NO_INPUT);
    const o = outcomeFromRun(run, 'facts');
    expect(o.facts).toEqual({
      heroDamageFrac: run.heroDamageFracSum / run.wavesScored,
      coreHpFrac: run.w.hp[run.core]! / run.w.maxHp[run.core]!,
      allies: 2,
    });
    expect(o.facts!.heroDamageFrac).toBeGreaterThan(0);
  });
});

describe('equipping and bonuses', () => {
  const unlocked = (ids: string[]) => ({ ...freshProfile(), titles: { unlocked: ids, equipped: null } });

  it('equips only unlocked titles; null unequips', () => {
    const p = equipTitle(unlocked(['spotless']), content, 'spotless');
    expect(p.titles.equipped).toBe('spotless');
    expect(() => equipTitle(p, content, 'veteran')).toThrow(MetaError);
    expect(() => equipTitle(p, content, 'nope')).toThrow(/unknown title/);
    expect(equipTitle(p, content, null).titles.equipped).toBeNull();
  });

  it('equipped bonus + stacked collection tiers reach the run; ranked turns them off', () => {
    const ids = T.titles.slice(0, 6).map((t) => t.id);
    const p = equipTitle(unlocked(ids), content, 'lone-survivor');
    expect(countedTitles(p, content)).toBe(6);
    const l = titleLoadout(p, content);
    // lone-survivor +5% damage, tier 3: +2% HP, tier 6: +3% damage
    expect(l.mods).toEqual({ damageMult: 0.08, maxHpMult: 0.02 });
    const run = createRun(buildRunConfig(p, content, { worldId }), content, 1);
    expect(run.mods.damageMult).toBeCloseTo(1.08, 9);
    // Ranked: no title bonus at all (gear is normalised separately, so compare with a title-less profile).
    const ranked = buildRunConfig(p, content, { worldId, ranked: true });
    const plain = buildRunConfig({ ...p, titles: { unlocked: [], equipped: null } }, content, { worldId, ranked: true });
    expect(ranked.loadout).toEqual(plain.loadout);
    expect(titleLoadout(p, content, true)).toEqual({ mods: {} });
  });
});

describe('save v1 → v2 migration (real v1 save)', () => {
  const v1 = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8');

  it('the current build reads a v1 save: totals.kills starts at 0, everything else kept', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(2); // v1 migrates through every later step
    const raw = JSON.parse(v1) as { version: number; profile: Record<string, unknown> & { totals: object } };
    expect(raw.version).toBe(1);
    const r = decodeSave(v1);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.migratedFrom).toBe(1);
    expect(r.profile.totals).toEqual({ ...raw.profile.totals, kills: 0 });
    // Later migrations touch heroes (v3: limitBreaks); everything else must be exactly kept.
    const { totals: _a, heroes: _h1, ...restOld } = raw.profile as typeof raw.profile & { heroes: unknown };
    const { totals: _b, heroes: _h2, ...restNew } = r.profile;
    expect(restNew).toEqual(restOld);
    expect(Profile.safeParse(r.profile).success).toBe(true);
  });

  it('the save service keeps the v1 text as a backup and writes the current version on the next save', async () => {
    const store = memoryStore({ 'them.save': v1 });
    const s = new KeyValueSaveService(store, { now: () => 5 });
    const r = await s.load();
    expect(r).toMatchObject({ status: 'ok', migratedFrom: 1 });
    expect(store.getItem('them.save.v1')).toBe(v1);
    if (r.status === 'ok') await s.save(r.profile);
    expect(JSON.parse(store.getItem('them.save')!).version).toBe(SAVE_VERSION);
  });
});
