/** P2-12: loadout power and the difficulty limiter (GDD §3). */
import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, stateHash, step, view, NO_INPUT, type Loadout } from '../src/api';
import { BASE_POWER, heroBaseStrength, limitLoadout, loadoutPower, type PowerBase } from '../src/power';

const worldId = content.worlds[0]!.id;
const ph = content.balance.playerHero;
const team = content.heroes.filter((h) => h.defaultTeam);
const base: PowerBase = {
  heroHp: ph.hp, heroArmor: ph.armor,
  allies: team.map((h) => ({ id: h.id, base: heroBaseStrength(h.hp, h.weapon) })),
  referenceTeam: team.reduce((a, h) => a + heroBaseStrength(h.hp, h.weapon), 0),
  referenceCount: team.length,
};
const R = content.worlds[0]!.recommendedPower;
const cap = content.balance.difficultyLimiter.cap;
const strong: Loadout = {
  mods: { damageMult: 1.5, maxHpMult: 1.8, armorAdd: 0.35, critChance: 0.2, allyDamageMult: 0.3, structureDamageMult: 0.3 },
  allyMods: Object.fromEntries(team.map((h) => [h.id, { hpMult: 3, damageMult: 2.5 }])),
};

describe('loadout power', () => {
  it('a bare loadout with the default team is exactly BASE_POWER, and Garroth recommends it', () => {
    expect(loadoutPower(undefined, base)).toBe(BASE_POWER);
    expect(loadoutPower({ mods: {} }, base)).toBe(BASE_POWER);
    expect(R).toBe(BASE_POWER);
  });

  it('grows with every kind of strength and is monotone in the scale', () => {
    for (const lo of [{ mods: { damageMult: 0.2 } }, { mods: { maxHpMult: 0.2 } }, { mods: { armorAdd: 0.1 } },
      { mods: { structureDamageMult: 0.2 } }, { allyMods: { [team[0]!.id]: { hpMult: 0.5 } } }] as Loadout[]) {
      expect(loadoutPower(lo, base), JSON.stringify(lo)).toBeGreaterThan(BASE_POWER);
    }
    let prev = 0;
    for (let s = 0; s <= 1; s += 0.125) { const p = loadoutPower(strong, base, s); expect(p).toBeGreaterThan(prev); prev = p; }
  });

  it('more heroes in the team count even at equal total strength', () => {
    const two = { ...base, allies: [{ id: 'a', base: 10 }, { id: 'b', base: 10 }], referenceTeam: 20, referenceCount: 2 };
    const four = { ...two, allies: [1, 2, 3, 4].map((i) => ({ id: `h${i}`, base: 5 })) };
    expect(loadoutPower(undefined, four)).toBeGreaterThan(loadoutPower(undefined, two));
  });
});

describe('difficulty limiter', () => {
  it('below recommended: no scaling, no penalty', () => {
    const r = limitLoadout({ mods: { damageMult: -0.2 } }, base, R, cap);
    expect(r).toMatchObject({ active: false, scale: 1, allyFactor: 1 });
  });

  it('above recommended: effective power has diminishing returns and stays under +cap', () => {
    const effs = [0.1, 0.5, 1, 3].map((x) => limitLoadout({ mods: { damageMult: x } }, base, R, cap));
    for (const e of effs) {
      expect(e.active).toBe(true);
      expect(e.effectivePower).toBeLessThan(R * (1 + cap));
      expect(e.effectivePower).toBeGreaterThan(R);
      expect(e.scale).toBeLessThan(1);
    }
    for (let i = 1; i < effs.length; i++) expect(effs[i]!.effectivePower).toBeGreaterThan(effs[i - 1]!.effectivePower);
    const big = limitLoadout(strong, base, R, cap);
    expect(big.power).toBeGreaterThan(3 * R);
    expect(big.effectivePower).toBeCloseTo(R * (1 + (cap * (big.power / R - 1)) / (big.power / R - 1 + cap)), 6);
  });

  it('createRun scales the loadout instead of stacking a damage multiplier, and view exposes it', () => {
    const run = createRun({ worldId, loadout: strong }, content, 1);
    const v = view(run);
    expect(v.limiterActive).toBe(true);
    expect(v.recommendedPower).toBe(R);
    expect(v.power).toBeGreaterThan(R);
    expect(v.effectivePower).toBeLessThan(R * (1 + cap));
    expect(run.powerMult).toBe(1);
    expect(run.mods.damageMult).toBeCloseTo(1 + 1.5 * v.loadoutScale, 12);
    const a = run.allies[0]!, d = content.heroes.find((h) => h.id === team[0]!.id)!;
    expect(run.w.maxHp[a]).toBeCloseTo(d.hp * 4 * run.limiter.allyFactor, 9);
    expect(run.w.maxHp[a]).toBeLessThan(d.hp * 4);
  });

  it('a bare run is unchanged: power 100, limiter off', () => {
    const v = view(createRun({ worldId }, content, 1));
    expect(v).toMatchObject({ power: BASE_POWER, recommendedPower: R, limiterActive: false, loadoutScale: 1 });
  });

  it('explicit power is for bare runs only; combining it with loadout mods throws', () => {
    expect(() => createRun({ worldId, power: 500, loadout: { mods: { damageMult: 0.1 } } }, content, 1)).toThrow(/either/);
    const run = createRun({ worldId, power: R * 2 }, content, 1);
    expect(run.powerMult).toBeGreaterThan(1);
    expect(run.powerMult).toBeLessThan(1 + cap);
    expect(createRun({ worldId, power: R / 2 }, content, 1).powerMult).toBe(1); // no penalty below
  });

  it('is deterministic: same loadout + seed + inputs ⇒ same hash', () => {
    const a = createRun({ worldId, loadout: strong }, content, 9);
    const b = createRun({ worldId, loadout: structuredClone(strong) }, content, 9);
    for (let i = 0; i < 300; i++) { step(a, NO_INPUT); step(b, NO_INPUT); }
    expect(stateHash(b)).toBe(stateHash(a));
  });
});
