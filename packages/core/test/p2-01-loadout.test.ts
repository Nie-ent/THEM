// P2-01: meta loadout → createRun. Core consumes the loadout as modifiers only.
import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, stateHash, step } from '../src/api';
import { NO_INPUT } from '../src/types';

const worldId = content.worlds[0]!.id;
const hp = content.balance.playerHero.hp;
const speed = content.balance.playerHero.speed;

describe('P2-01 loadout', () => {
  it('no loadout and an empty loadout give the exact same run', () => {
    const a = createRun({ worldId }, content, 7);
    const b = createRun({ worldId, loadout: {} }, content, 7);
    const c = createRun({ worldId, loadout: { mods: {} } }, content, 7);
    for (let i = 0; i < 90; i++) { step(a, NO_INPUT); step(b, NO_INPUT); step(c, NO_INPUT); }
    expect(stateHash(b)).toBe(stateHash(a));
    expect(stateHash(c)).toBe(stateHash(a));
  });

  it('applies Mult keys as fractions and other keys additively, before any card', () => {
    const run = createRun({ worldId, loadout: { mods: { maxHpMult: 0.25, speedMult: -0.1, armorAdd: 2, critChance: 0.05 } } }, content, 1);
    expect(run.mods.maxHpMult).toBeCloseTo(1.25, 12);
    expect(run.w.maxHp[run.hero]).toBeCloseTo(hp * 1.25, 9);
    expect(run.w.hp[run.hero]).toBeCloseTo(hp * 1.25, 9);
    expect(run.w.speed[run.hero]).toBeCloseTo(speed * 0.9, 9);
    expect(run.mods.armorAdd).toBe(2);
    expect(run.mods.critChance).toBeCloseTo(0.05, 12);
  });

  it('is order-independent (key order of the object does not change the run)', () => {
    const a = createRun({ worldId, loadout: { mods: { damageMult: 0.1, critMult: 0.2, cooldownMult: -0.05 } } }, content, 3);
    const b = createRun({ worldId, loadout: { mods: { cooldownMult: -0.05, critMult: 0.2, damageMult: 0.1 } } }, content, 3);
    for (let i = 0; i < 60; i++) { step(a, NO_INPUT); step(b, NO_INPUT); }
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('a loadout changes the run state (it is part of the replay record)', () => {
    const a = createRun({ worldId }, content, 5);
    const b = createRun({ worldId, loadout: { mods: { maxHpMult: 0.1 } } }, content, 5);
    expect(stateHash(b)).not.toBe(stateHash(a));
  });

  it('copies the loadout: mutating the caller object later has no effect', () => {
    const mods: Record<string, number> = { damageMult: 0.1 };
    const run = createRun({ worldId, loadout: { mods } }, content, 1);
    mods.damageMult = 5;
    expect(run.config.loadout.mods!.damageMult).toBe(0.1);
  });

  it('cardParams add to numbers and per-level tables, in the run copy only', () => {
    const before = structuredClone(content.cards.find((c) => c.id === 'ember-ring')!.params);
    const run = createRun({ worldId, loadout: { cardParams: { 'ember-ring': { radius: 15, damage: 2 } } } }, content, 1);
    const p = run.idx.cards[run.idx.cardIdx.get('ember-ring')!]!.params;
    expect(p.radius).toEqual((before.radius as number[]).map((x) => x + 15));
    expect(p.damage).toEqual((before.damage as number[]).map((x) => x + 2));
    expect(content.cards.find((c) => c.id === 'ember-ring')!.params).toEqual(before);
    const glass = run.idx.cards[run.idx.cardIdx.get('split-shot')!]!.params;
    expect(glass).toEqual(content.cards.find((c) => c.id === 'split-shot')!.params);
  });

  it('cardWeights multiply draft weights; 0 removes the card from offers', () => {
    const banned = Object.fromEntries(content.cards.filter((c) => c.id !== 'quickdraw').map((c) => [c.id, 0]));
    const run = createRun({ worldId, loadout: { cardWeights: banned } }, content, 1);
    run.pendingLevels = 1;
    step(run, NO_INPUT); // opens the draft
    expect(run.draft?.map((o) => o.cardId)).toEqual(['quickdraw']);
    expect(content.cards.find((c) => c.id === 'sharpened-edge')!.weight).toBeGreaterThan(0);
  });

  it('rejects unknown cards, missing params and bad weights', () => {
    expect(() => createRun({ worldId, loadout: { cardParams: { nope: { x: 1 } } } }, content, 1)).toThrow(/unknown card "nope"/);
    expect(() => createRun({ worldId, loadout: { cardParams: { 'ember-ring': { bounce: 1 } } } }, content, 1)).toThrow(/no numeric param "bounce"/);
    expect(() => createRun({ worldId, loadout: { cardWeights: { quickdraw: -1 } } }, content, 1)).toThrow(/negative/);
  });

  it('allyMods scale an AI hero base HP and weapon damage; others untouched', () => {
    const mira = content.heroes.find((h) => h.id === 'mira')!;
    const brann = content.heroes.find((h) => h.id === 'brann')!;
    const run = createRun({ worldId, loadout: { allyMods: { mira: { hpMult: 0.5, damageMult: 0.25 } } } }, content, 1);
    const [a, b] = run.allyDefs.map((d) => content.heroes[d]!.id);
    const iMira = a === 'mira' ? run.allies[0]! : run.allies[1]!;
    const iBrann = b === 'brann' ? run.allies[1]! : run.allies[0]!;
    expect(run.w.maxHp[iMira]).toBeCloseTo(mira.hp * 1.5, 9);
    expect(run.w.wDamage[iMira]).toBeCloseTo(mira.weapon.damage * 1.25, 9);
    expect(run.w.maxHp[iBrann]).toBe(brann.hp);
    expect(() => createRun({ worldId, loadout: { allyMods: { ghost: { hpMult: 1 } } } }, content, 1)).toThrow(/unknown hero/);
    expect(() => createRun({ worldId, loadout: { allyMods: { mira: { speed: 1 } as never } } }, content, 1)).toThrow(/unknown key/);
    expect(() => createRun({ worldId, loadout: { allyMods: { mira: { hpMult: -1 } } } }, content, 1)).toThrow(/> -1/);
  });

  it('rejects unknown keys and non-finite values', () => {
    expect(() => createRun({ worldId, loadout: { mods: { nope: 1 } as never } }, content, 1)).toThrow(/unknown loadout mod "nope"/);
    expect(() => createRun({ worldId, loadout: { mods: { damageMult: Number.NaN } } }, content, 1)).toThrow(/not a finite number/);
    expect(() => createRun({ worldId, loadout: { mods: { damageMult: Infinity } } }, content, 1)).toThrow(/not a finite number/);
  });
});
