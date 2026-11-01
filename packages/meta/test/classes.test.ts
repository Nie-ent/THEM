import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { NO_INPUT, createRun, step, type Run } from '@them/core';
import {
  checkClassesContent, classBlock, classChain, classChangeCost, classLoadout, setClass, tierLevel,
} from '../src/classes';
import { buildRunConfig } from '../src/loadout';
import { checkMetaContent, type Profile } from '../src/profile';
import { MetaError } from '../src/progression';
import { allocateTrait, traitBlock } from '../src/traits';
import { freshProfile } from './helpers';

const C = content.classes;
const worldId = content.worlds[0]!.id;
const seal = C.change.itemId;
const at = (level: number, extra: Partial<Profile> = {}): Profile => ({ ...freshProfile(), level, ...extra });

/** Every card offered across `levels` level-ups (picking the first option each time). */
function offeredCards(run: Run, levels = 12): Set<string> {
  const seen = new Set<string>();
  for (let i = 0; i < levels; i++) {
    run.pendingLevels++;
    step(run, NO_INPUT);
    for (const o of run.draft ?? []) seen.add(o.cardId);
    if (run.draft) step(run, { moveX: 0, moveY: 0, pickCard: 0 });
  }
  return seen;
}

describe('class content (GDD §6)', () => {
  it('4 tier-1 classes at Lv 10, 8 tier-2 at Lv 35 (two per tier-1), all cross-checks pass', () => {
    expect(tierLevel(content, 1)).toBe(10);
    expect(tierLevel(content, 2)).toBe(35);
    const t1 = C.classes.filter((c) => c.tier === 1);
    expect(t1.map((c) => c.id)).toEqual(['warrior', 'mage', 'ranger', 'marshal']);
    for (const c of t1) expect(C.classes.filter((x) => x.parent === c.id)).toHaveLength(2);
    expect(C.classes.filter((c) => c.tier === 2)).toHaveLength(8);
    expect(checkClassesContent(content)).toEqual([]);
    expect(checkMetaContent(content)).toEqual([]);
  });

  it('every class has its own exclusive card and a class trait node', () => {
    for (const c of C.classes) {
      expect(c.cards.length).toBeGreaterThan(0);
      expect(content.traits.nodes.some((n) => n.requiresClass === c.id)).toBe(true);
    }
  });
});

describe('picking and changing class', () => {
  it('needs Lv 10 for tier 1 and Lv 35 for tier 2; tier 1 comes first', () => {
    expect(classBlock(at(9), content, 'warrior')).toBe('level');
    expect(classBlock(at(10), content, 'warrior')).toBeNull();
    expect(classBlock(at(40), content, 'berserker')).toBe('tier-1-first');
    const w = setClass(at(34), content, 'warrior');
    expect(classBlock(w, content, 'berserker')).toBe('level');
    expect(classBlock({ ...w, level: 35 }, content, 'berserker')).toBeNull();
    expect(classBlock(w, content, 'warrior')).toBe('same');
    expect(classBlock(w, content, 'nope')).toBe('unknown');
  });

  it('first pick and promotion are free; any other change costs a Class Seal', () => {
    let p = setClass(at(40), content, 'warrior');
    expect(classChangeCost(p, content, 'shield-knight')).toBe(0);
    p = setClass(p, content, 'shield-knight');
    expect(classChain(content, p.classId).map((c) => c.id)).toEqual(['warrior', 'shield-knight']);
    expect(classChangeCost(p, content, 'pyromancer')).toBe(C.change.cost);
    expect(() => setClass(p, content, 'pyromancer')).toThrow(MetaError);
    p = { ...p, items: { [seal]: 2 } };
    const q = setClass(p, content, 'pyromancer');
    expect(q.classId).toBe('pyromancer');
    expect(classChain(content, q.classId).map((c) => c.id)).toEqual(['mage', 'pyromancer']);
    expect(q.items[seal]).toBe(2 - C.change.cost);
  });

  it('changing class refunds class trait nodes the new class does not hold', () => {
    let p = setClass(at(12), content, 'warrior');
    p = { ...p, traits: { ...p.traits, unspentPoints: 5 }, items: { [seal]: 1 } };
    expect(traitBlock(p, content, 'cl-mage-attunement')).toBe('requires-class');
    p = allocateTrait(allocateTrait(p, content, 'cl-warrior-discipline'), content, 'cl-warrior-discipline');
    expect(p.traits.unspentPoints).toBe(3);
    const q = setClass(p, content, 'mage');
    expect(q.traits.nodes['cl-warrior-discipline']).toBeUndefined();
    expect(q.traits.unspentPoints).toBe(5);
  });
});

describe('class in the run', () => {
  it('chain mods, unlocked cards and weights reach the loadout', () => {
    const p = setClass(setClass(at(35), content, 'warrior'), content, 'berserker');
    const l = classLoadout(p, content);
    expect(l.mods).toMatchObject({ maxHpMult: 0.1, armorAdd: 0.03, damageMult: 0.15, damageTakenMult: 0.1 });
    expect(l.unlockCards).toEqual(['blood-frenzy', 'war-cry']);
    expect(l.cardWeights).toMatchObject({ 'sharpened-edge': 1.5 });
    const cfg = buildRunConfig(p, content, { worldId });
    expect(cfg.loadout?.unlockCards).toEqual(['blood-frenzy', 'war-cry']);
    const run = createRun(cfg, content, 1);
    expect(run.mods.damageMult).toBeCloseTo(1.15, 9);
  });

  it('a class run can be offered its own cards; a bare run never sees any exclusive card', () => {
    const exclusive = new Set(content.cards.filter((c) => c.exclusive).map((c) => c.id));
    const bare = offeredCards(createRun({ worldId }, content, 3), 20);
    expect([...bare].filter((id) => exclusive.has(id))).toEqual([]);
    const p = setClass(at(10), content, 'ranger');
    let seen = new Set<string>();
    for (let seed = 1; seed <= 6 && !seen.has('hawk-eye'); seed++) seen = offeredCards(createRun(buildRunConfig(p, content, { worldId }), content, seed), 20);
    expect(seen.has('hawk-eye')).toBe(true);
    expect([...seen].filter((id) => exclusive.has(id) && id !== 'hawk-eye')).toEqual([]);
  });

  it('class trait nodes only count while the class is held', () => {
    let p = setClass(at(12), content, 'mage');
    p = allocateTrait({ ...p, traits: { ...p.traits, unspentPoints: 1 } }, content, 'cl-mage-attunement');
    const run = createRun(buildRunConfig(p, content, { worldId }), content, 1);
    expect(run.mods.cooldownMult).toBeCloseTo(1 - 0.08 - 0.02, 9); // class −8% and node −2% are summed in the loadout
  });
});
