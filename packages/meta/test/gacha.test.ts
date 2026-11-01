import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun } from '@them/core';
import { seededRolls, type RollSource } from '../src/env';
import { checkGachaContent, fiveStarChance, grantHero, pull, rollStar, type PityState } from '../src/gacha';
import { buildRunConfig } from '../src/loadout';
import { checkMetaContent, type Profile } from '../src/profile';
import { MetaError } from '../src/progression';
import { freshProfile } from './helpers';

const G = content.gacha;
const worldId = content.worlds[0]!.id;
const rich = (gold = 10_000_000): Profile => ({ ...freshProfile(), currencies: { gold } });
const fixed = (v: number): RollSource => ({ float: () => v, int: () => 0 });

describe('gacha content (GDD §12)', () => {
  it('rates, pity and cost; every star has a hero; cross-checks pass', () => {
    expect(checkGachaContent(content)).toEqual([]);
    expect(checkMetaContent(content)).toEqual([]);
    expect(G.rates).toEqual({ '5': 0.015, '4': 0.1, '3': 0.285, '2': 0.3, '1': 0.3 });
    expect(G.pity).toEqual({ softFrom: 60, softStep: 0.06, hard: 80, guarantee4Every: 10 });
  });

  it('gacha heroes stay out of bare runs (defaultTeam false)', () => {
    const run = createRun({ worldId }, content, 1);
    expect(run.allyDefs.map((d) => content.heroes[d]!.id)).toEqual(['mira', 'brann']);
  });
});

describe('pity math', () => {
  it('soft pity from 60 (+6%/pull), sure at 80', () => {
    expect(fiveStarChance(content, 1)).toBe(0.015);
    expect(fiveStarChance(content, 59)).toBe(0.015);
    expect(fiveStarChance(content, 60)).toBeCloseTo(0.075, 12);
    expect(fiveStarChance(content, 70)).toBeCloseTo(0.675, 12);
    expect(fiveStarChance(content, 79)).toBe(1);
    expect(fiveStarChance(content, 80)).toBe(1);
  });

  it('exact distribution: mean ≈ 41 pulls per 5★, 90% by pull 65 (GDD §12)', () => {
    let surv = 1, mean = 0, cdf = 0, p90 = 0;
    for (let n = 1; n <= G.pity.hard; n++) {
      const f = surv * fiveStarChance(content, n);
      mean += n * f;
      cdf += f;
      if (!p90 && cdf >= 0.9) p90 = n;
      surv -= f;
    }
    expect(mean).toBeCloseTo(41.2, 1);
    expect(p90).toBe(65);
  });

  it('rollStar: 5★ resets both counters, 4★ resets the 4★ counter, the 10th pull without 4★+ is a 4★', () => {
    const s: PityState = { pullsSince5: 0, pullsSince4: 0 };
    expect(rollStar(content, s, fixed(0.999))).toBe(1);
    expect(s).toEqual({ pullsSince5: 1, pullsSince4: 1 });
    const g4: PityState = { pullsSince5: 20, pullsSince4: 9 };
    expect(rollStar(content, g4, fixed(0.999))).toBe(4);
    expect(g4).toEqual({ pullsSince5: 21, pullsSince4: 0 });
    const g5: PityState = { pullsSince5: 79, pullsSince4: 3 };
    expect(rollStar(content, g5, fixed(0.999))).toBe(5);
    expect(g5).toEqual({ pullsSince5: 0, pullsSince4: 0 });
  });
});

describe('pulling', () => {
  it('a 10-pull costs the 10-pull price, gives 10 results with at least one 4★+, and advances pity', () => {
    const r = pull(rich(), content, 'standard', 10, seededRolls(5));
    expect(r.results).toHaveLength(10);
    expect(r.results.some((x) => x.stars >= 4)).toBe(true);
    expect(r.profile.currencies.gold).toBe(10_000_000 - G.cost.ten);
    expect(r.profile.gacha.totalPulls).toBe(10);
  });

  it('new heroes join the roster and the team (room permitting); duplicates become shards', () => {
    let p = rich();
    const a = grantHero(p, content, 'tova');
    expect(a.duplicate).toBe(false);
    expect(a.profile.heroes.owned.find((h) => h.heroId === 'tova')).toMatchObject({ stars: 3, level: 1, limitBreaks: 0 });
    expect(a.profile.heroes.team).toContain('tova');
    p = a.profile;
    const b = grantHero(p, content, 'mira');
    expect(b).toMatchObject({ duplicate: true, shards: G.duplicateShards['2'] });
    expect(b.profile.items[content.heroGrowth.shardItemId]).toBe(G.duplicateShards['2']);
    // The pulled hero fights: Tova is in the run.
    const run = createRun(buildRunConfig(a.profile, content, { worldId }), content, 1);
    expect(run.allyDefs.map((d) => content.heroes[d]!.id)).toContain('tova');
  });

  it('pity carries across pulls and banners (it lives in the profile)', () => {
    let p = rich();
    for (let i = 0; i < 5; i++) p = pull(p, content, 'standard', 1, fixed(0.5)).profile;
    expect(p.gacha.pullsSince5).toBe(5);
    p = { ...p, gacha: { ...p.gacha, pullsSince5: 79 } };
    const r = pull(p, content, 'standard', 1, fixed(0.999));
    expect(r.results[0]!.stars).toBe(5);
    expect(r.results[0]!.heroId).toBe('seraphine');
    expect(r.profile.gacha.pullsSince5).toBe(0);
  });

  it('refuses without enough gold, unknown banners and bad counts', () => {
    expect(() => pull(rich(10), content, 'standard', 1, seededRolls(1))).toThrow(MetaError);
    expect(() => pull(rich(), content, 'nope', 1, seededRolls(1))).toThrow(/unknown banner/);
    expect(() => pull(rich(), content, 'standard', 3 as 1, seededRolls(1))).toThrow(/1 or 10/);
  });
});
