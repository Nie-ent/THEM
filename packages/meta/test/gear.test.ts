import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun } from '@them/core';
import { seededRolls, type RollSource } from '../src/env';
import {
  checkGearContent, enhanceGear, enhanceInfo, equipGear, gearLoadout, grantGear, unequipSlot,
} from '../src/gear';
import { buildRunConfig } from '../src/loadout';
import { checkMetaContent, type Profile } from '../src/profile';
import { MetaError } from '../src/progression';
import { computeRunRewards, type RunOutcome } from '../src/rewards';
import { freshProfile } from './helpers';

const G = content.gear;
const E = G.enhance;
const worldId = content.worlds[0]!.id;
const rolls = (seed = 1) => seededRolls(seed);
/** A roll source that always returns `v` (forces success / failure / drop). */
const fixed = (v: number): RollSource => ({ float: () => v, int: (n) => Math.floor(v * n) });

function rich(p: Profile = freshProfile()): Profile {
  return { ...p, items: { ...p.items, [E.stoneItemId]: 100_000, [E.protectItemId]: 1000 }, currencies: { ...p.currencies, [E.goldCurrency]: 10_000_000 } };
}
function withItem(itemId: string, enhance = 0, p: Profile = rich()): { p: Profile; uid: string } {
  const r = grantGear(p, content, itemId, rolls(7));
  const q = equipGear(r.profile, content, r.uid);
  q.gear.items.find((g) => g.uid === r.uid)!.enhance = enhance;
  return { p: q, uid: r.uid };
}

describe('gear content', () => {
  it('passes the cross-checks; 3 slots; enhancement steps follow GDD §12', () => {
    expect(checkGearContent(content)).toEqual([]);
    expect(checkMetaContent(content)).toEqual([]);
    expect(G.slots.map((s) => s.id)).toEqual(['weapon', 'armor', 'accessory']);
    expect(E.maxLevel).toBe(15);
    expect(E.steps.slice(0, 10).every((s) => s.chance === 1 && s.dropChance === 0)).toBe(true);
    expect(E.steps.slice(10).map((s) => s.chance)).toEqual([0.6, 0.5, 0.4, 0.3, 0.2]);
    expect(E.steps.slice(10).map((s) => s.dropChance)).toEqual([0, 0.5, 0.5, 0.5, 0.5]);
  });
});

describe('expected attempts +10 → +15 (GDD §12: about 40, and 15 with a scroll every time)', () => {
  /** Exact expectation from the content step table (value iteration on the level chain). */
  function exact(protect: boolean): number {
    const steps = E.steps.slice(10);
    let ev = new Array(steps.length + 1).fill(0) as number[];
    for (let it = 0; it < 20_000; it++) {
      const next = [...ev];
      for (let i = steps.length - 1; i >= 0; i--) {
        const s = steps[i]!;
        const down = i > 0 ? ev[i - 1]! : ev[i]!;
        const fail = protect ? ev[i]! : s.dropChance * down + (1 - s.dropChance) * ev[i]!;
        next[i] = 1 + s.chance * ev[i + 1]! + (1 - s.chance) * fail;
      }
      ev = next;
    }
    return ev[0]!;
  }

  it('exact: 40.3 without scrolls, 14.5 with', () => {
    expect(exact(false)).toBeCloseTo(40.31, 1);
    expect(exact(true)).toBeCloseTo(14.5, 1);
    expect(Math.abs(exact(false) - 40) / 40).toBeLessThan(0.05);
    expect(Math.abs(exact(true) - 15) / 15).toBeLessThan(0.05);
  });

  it('enhanceGear with seeded rolls matches the exact value (3,000 items each)', () => {
    for (const protect of [false, true]) {
      const r = rolls(protect ? 11 : 10);
      let total = 0;
      const trials = 3000;
      for (let t = 0; t < trials; t++) {
        const start = withItem('worn-blade', 10);
        const uid = start.uid;
        let p = start.p;
        let n = 0;
        while (p.gear.items.find((g) => g.uid === uid)!.enhance < 15) {
          p = enhanceGear(p, content, uid, r, { protect }).profile;
          n++;
        }
        total += n;
      }
      const mean = total / trials;
      expect(Math.abs(mean - exact(protect)) / exact(protect)).toBeLessThan(0.05);
    }
  });
});

describe('enhancing', () => {
  it('+0 → +10 always succeeds and charges stones + gold per step', () => {
    const start = withItem('worn-blade');
    const uid = start.uid;
    let p = start.p;
    const stones0 = p.items[E.stoneItemId]!, gold0 = p.currencies[E.goldCurrency]!;
    for (let i = 0; i < 10; i++) p = enhanceGear(p, content, uid, fixed(0.999)).profile;
    expect(enhanceInfo(p, content, uid).level).toBe(10);
    const cost = E.steps.slice(0, 10);
    expect(p.items[E.stoneItemId]).toBe(stones0 - cost.reduce((a, s) => a + s.stones, 0));
    expect(p.currencies[E.goldCurrency]).toBe(gold0 - cost.reduce((a, s) => a + s.gold, 0));
  });

  it('+10 → +11 failure keeps the level; from +11 a failure may drop one level', () => {
    const at10 = withItem('worn-blade', 10);
    expect(enhanceGear(at10.p, content, at10.uid, fixed(0.99)).outcome).toBe('fail');
    const at12 = withItem('worn-blade', 12);
    const drop = enhanceGear(at12.p, content, at12.uid, fixed(0.1 + 0.89)); // fails (≥0.4), then 0.99 ≥ 0.5: no drop
    expect(drop.outcome).toBe('fail');
    let calls = 0;
    const failThenDrop: RollSource = { float: () => (calls++ === 0 ? 0.9 : 0.1), int: () => 0 };
    const r = enhanceGear(at12.p, content, at12.uid, failThenDrop);
    expect(r.outcome).toBe('fail-drop');
    expect(r.level).toBe(11);
  });

  it('a protection scroll prevents the drop and is spent only where a drop is possible', () => {
    const at12 = withItem('worn-blade', 12);
    const s0 = at12.p.items[E.protectItemId]!;
    const r = enhanceGear(at12.p, content, at12.uid, fixed(0.9), { protect: true });
    expect(r.outcome).toBe('fail-protected');
    expect(r.level).toBe(12);
    expect(r.profile.items[E.protectItemId]).toBe(s0 - 1);
    const at3 = withItem('worn-blade', 3);
    expect(enhanceGear(at3.p, content, at3.uid, fixed(0.5), { protect: true }).profile.items[E.protectItemId]).toBe(s0);
  });

  it('refuses at +15, without materials, or protect without a scroll', () => {
    const max = withItem('worn-blade', 15);
    expect(() => enhanceGear(max.p, content, max.uid, rolls())).toThrow(/already \+15/);
    const poor = withItem('worn-blade', 0, freshProfile());
    expect(() => enhanceGear(poor.p, content, poor.uid, rolls())).toThrow(MetaError);
    const noScroll = withItem('worn-blade', 12, { ...rich(), items: { [E.stoneItemId]: 100 } });
    expect(() => enhanceGear(noScroll.p, content, noScroll.uid, rolls(), { protect: true })).toThrow(/protection scroll/);
  });
});

describe('gear in the run', () => {
  it('a new profile wears the starting kit and adds nothing at +0 (Phase 1 parity)', () => {
    const p = freshProfile();
    expect(p.gear.items.map((g) => g.itemId)).toEqual(G.starting);
    expect(Object.keys(p.gear.equipped).sort()).toEqual(['armor', 'weapon']);
    expect(gearLoadout(p, content)).toEqual({ mods: {} });
    expect(buildRunConfig(p, content, { worldId }).loadout).toEqual({ mods: {} });
  });

  it('enhancement level and set pieces reach core', () => {
    let { p } = withItem('warlord-axe', 5);
    p = withItem('warlord-signet', 0, p).p;
    // axe +10% + 5 × 2%, signet +5%, set 2 pieces +5% → +30% damage
    expect(gearLoadout(p, content).mods).toEqual({ damageMult: 0.3 });
    p = withItem('warlord-plate', 0, p).p;
    expect(gearLoadout(p, content).mods).toEqual({ damageMult: 0.3, maxHpMult: 0.2, armorAdd: 0.06 });
    const run = createRun(buildRunConfig(p, content, { worldId }), content, 1);
    expect(run.mods.damageMult).toBeCloseTo(1.3, 9);
  });

  it('ranked counts every item at rankedLevel; unequipping removes it', () => {
    const { p } = withItem('worn-blade', 15);
    expect(gearLoadout(p, content).mods).toEqual({ damageMult: 0.3 });
    // Ranked: the blade and the starting vest both count as +rankedLevel.
    expect(gearLoadout(p, content, true).mods).toEqual({ damageMult: 0.02 * E.rankedLevel, maxHpMult: 0.02 * E.rankedLevel });
    expect(gearLoadout(unequipSlot(p, 'weapon'), content).mods).toEqual({});
  });

  it('runs pay enhancement stones by grade like gold', () => {
    const n = content.worlds[0]!.waves.length;
    const o: RunOutcome = {
      runId: 'g', worldId, difficulty: 'normal', result: 'win', wavesCleared: n, waveCount: n,
      score: { kills: { normal: 0, elite: 0, miniboss: 0, boss: 0 }, killPoints: 0, bossBonus: 0, mDifficulty: 1, mSpeed: 1, mDamage: 1, performance: 1, total: 0, grade: 'A', rewardPct: 100 },
    };
    expect(computeRunRewards(o, content).items).toEqual(content.worlds[0]!.rewardItems);
  });
});
