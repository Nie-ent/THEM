import { describe, expect, it } from 'vitest';
import { content, loadContent, raw } from '@them/content';
import { createRun } from '@them/core';
import { buildRunConfig } from '../src/loadout';
import { checkMetaContent, type Profile } from '../src/profile';
import { MetaError, grantExp } from '../src/progression';
import {
  allocateTrait, checkTraitsContent, keystonesTaken, pointsInBranch, resetTraits, traitBlock, traitLoadout, traitResetCost,
} from '../src/traits';
import { freshProfile } from './helpers';

const worldId = content.worlds[0]!.id;
const T = content.traits;
const def = (id: string) => T.nodes.find((n) => n.id === id)!;

/** A profile with `points` unspent trait points at level `level` (stat points ignored). */
function withPoints(points: number, level = 5): Profile {
  const p = freshProfile();
  return { ...p, level, traits: { ...p.traits, unspentPoints: points } };
}
function take(p: Profile, ...ids: string[]): Profile {
  for (const id of ids) p = allocateTrait(p, content, id);
  return p;
}
const times = (id: string, n: number) => Array.from({ length: n }, () => id);

describe('trait tree content', () => {
  it('passes the cross-checks: 4 branches, ids, requirements, keys, card params', () => {
    expect(T.branches.map((b) => b.id)).toEqual(['vanguard', 'arcanist', 'hunter', 'commander']);
    expect(checkTraitsContent(content)).toEqual([]);
    expect(checkMetaContent(content)).toEqual([]);
  });

  it('every branch has minors, a card node and exactly one keystone; at least 3 hybrids', () => {
    for (const b of T.branches) {
      const nodes = T.nodes.filter((n) => n.branch === b.id);
      expect(nodes.some((n) => n.kind === 'minor')).toBe(true);
      expect(nodes.some((n) => n.kind === 'card')).toBe(true);
      expect(nodes.filter((n) => n.kind === 'keystone')).toHaveLength(1);
    }
    expect(T.nodes.filter((n) => n.kind === 'hybrid').length).toBeGreaterThanOrEqual(3);
  });

  it('keystones carry a drawback (some negative mod) or remove allies', () => {
    for (const k of T.nodes.filter((n) => n.kind === 'keystone')) {
      expect(k.noAllies || Object.values(k.mods).some((v) => v < 0)).toBe(true);
    }
  });

  it('reports bad data', () => {
    const bad = structuredClone(raw) as { traits: { nodes: Record<string, unknown>[] } };
    bad.traits.nodes.push({ ...bad.traits.nodes[0]!, id: 'x-bad', branch: 'nowhere', mods: { nope: 1 } });
    const c = loadContent(bad);
    const problems = checkMetaContent(c);
    expect(problems.some((s) => s.includes('unknown branch "nowhere"'))).toBe(true);
    expect(problems.some((s) => s.includes('unknown loadout mod "nope"'))).toBe(true);
  });
});

describe('allocating traits', () => {
  it('spends points and ranks up to maxRank', () => {
    let p = withPoints(10);
    p = take(p, ...times('vg-thick-skin', 5));
    expect(p.traits.nodes['vg-thick-skin']).toBe(5);
    expect(p.traits.unspentPoints).toBe(5);
    expect(pointsInBranch(p, content, 'vanguard')).toBe(5);
    expect(traitBlock(p, content, 'vg-thick-skin')).toBe('maxed');
    expect(() => allocateTrait(p, content, 'vg-thick-skin')).toThrow(MetaError);
  });

  it('enforces branch points, points available and unknown ids', () => {
    expect(traitBlock(withPoints(5), content, 'vg-iron-will')).toBe('branch-points');
    expect(traitBlock(withPoints(0), content, 'vg-thick-skin')).toBe('points');
    expect(traitBlock(withPoints(5), content, 'nope')).toBe('unknown');
    expect(() => allocateTrait(withPoints(0), content, 'vg-thick-skin')).toThrow(/points/);
    const p = take(withPoints(5), ...times('vg-thick-skin', 3));
    expect(traitBlock(p, content, 'vg-iron-will')).toBeNull();
  });

  it('keystones need 10 branch points and only one may be taken', () => {
    let p = withPoints(40);
    p = take(p, ...times('vg-thick-skin', 5), ...times('vg-iron-will', 3), ...times('vg-second-wind', 2));
    expect(pointsInBranch(p, content, 'vanguard')).toBe(10);
    p = take(p, 'vg-juggernaut');
    expect(keystonesTaken(p, content)).toBe(1);
    p = take(p, ...times('ar-focus', 5), ...times('ar-insight', 3), ...times('ar-kindling', 2));
    expect(pointsInBranch(p, content, 'arcanist')).toBe(10);
    expect(traitBlock(p, content, 'ar-glass-cannon')).toBe('keystone-limit');
  });

  it('hybrids unlock only with enough points in both branches', () => {
    let p = withPoints(20);
    p = take(p, ...times('vg-thick-skin', 5), 'vg-iron-will');
    expect(traitBlock(p, content, 'hy-spellblade')).toBe('requires-branches');
    p = take(p, ...times('ar-focus', 5), 'ar-insight');
    expect(traitBlock(p, content, 'hy-spellblade')).toBeNull();
    p = take(p, 'hy-spellblade');
    expect(p.traits.nodes['hy-spellblade']).toBe(1);
  });
});

describe('traits in the run', () => {
  it('minor + keystone mods reach core', () => {
    let p = withPoints(20);
    p = take(p, ...times('ar-focus', 5), ...times('ar-insight', 3), ...times('ar-kindling', 2), 'ar-glass-cannon');
    const run = createRun(buildRunConfig(p, content, { worldId }), content, 1);
    expect(run.mods.damageMult).toBeCloseTo(1.8, 9);
    expect(run.mods.cooldownMult).toBeCloseTo(0.9, 9);
    expect(run.w.maxHp[run.hero]).toBeCloseTo(content.balance.playerHero.hp * 0.5, 6);
  });

  it('card nodes change the card in the run (Ember Mastery: radius and damage per rank)', () => {
    let p = withPoints(20);
    p = take(p, ...times('ar-focus', 5), ...times('ar-ember-mastery', 2));
    const run = createRun(buildRunConfig(p, content, { worldId }), content, 1);
    const base = content.cards.find((c) => c.id === 'ember-ring')!.params;
    const got = run.idx.cards[run.idx.cardIdx.get('ember-ring')!]!.params;
    expect(got.radius).toEqual((base.radius as number[]).map((x) => x + 20));
    expect(got.damage).toEqual((base.damage as number[]).map((x) => x + 4));
  });

  it('Lone Wolf brings no AI heroes', () => {
    let p = withPoints(20);
    p = take(p, ...times('hu-keen-eye', 5), ...times('hu-fleet', 3), ...times('hu-long-shot', 2), 'hu-lone-wolf');
    const cfg = buildRunConfig(p, content, { worldId });
    expect(cfg.allyHeroes).toEqual([]);
    expect(createRun(cfg, content, 1).allies).toEqual([]);
    expect(traitLoadout(p, content).noAllies).toBe(true);
  });

  it('a profile without traits adds nothing (Phase 1 parity)', () => {
    expect(traitLoadout(freshProfile(), content)).toEqual({ mods: {}, cardParams: {}, cardWeights: {}, noAllies: false });
    expect(buildRunConfig(freshProfile(), content, { worldId }).loadout).toEqual({ mods: {} });
  });
});

describe('trait reset', () => {
  const crystal = T.respec.itemId;

  it('is free up to freeUntilLevel and refunds every point', () => {
    let p = withPoints(8, T.respec.freeUntilLevel);
    p = take(p, ...times('vg-thick-skin', 3), ...times('cm-masonry', 2));
    expect(traitResetCost(p, content)).toBe(0);
    const r = resetTraits(p, content);
    expect(r.traits.nodes).toEqual({});
    expect(r.traits.unspentPoints).toBe(8);
    expect(r.traits.respecs).toBe(1);
  });

  it('after that, full and one-branch resets cost crystals; branch reset also drops dependent hybrids', () => {
    let p = withPoints(30, 20);
    p = take(p, ...times('vg-thick-skin', 5), 'vg-iron-will', ...times('ar-focus', 5), 'ar-insight', 'hy-spellblade', ...times('cm-masonry', 2));
    expect(() => resetTraits(p, content, 'vanguard')).toThrow(/needs 1/);
    p = { ...p, items: { [crystal]: 3 } };
    const r = resetTraits(p, content, 'vanguard');
    expect(r.items[crystal]).toBe(3 - T.respec.branchCost);
    expect(r.traits.nodes['vg-thick-skin']).toBeUndefined();
    expect(r.traits.nodes['hy-spellblade']).toBeUndefined(); // needs vanguard
    expect(r.traits.nodes['ar-focus']).toBe(5);
    expect(r.traits.nodes['cm-masonry']).toBe(2);
    expect(r.traits.unspentPoints).toBe(p.traits.unspentPoints + 6 + def('hy-spellblade').cost);
    const full = resetTraits(r, content);
    expect(full.items[crystal]).toBe(3 - T.respec.branchCost - T.respec.fullCost);
    expect(full.traits.nodes).toEqual({});
  });

  it('nothing to reset → no charge; unknown branch throws', () => {
    const p = { ...withPoints(0, 30), items: { [crystal]: 5 } };
    expect(resetTraits(p, content)).toBe(p);
    expect(() => resetTraits(p, content, 'nope')).toThrow(/unknown branch/);
  });

  it('trait points come from Global Levels', () => {
    const p = grantExp(freshProfile(), content, 20 + 92).profile;
    expect(p.traits.unspentPoints).toBe(2 * content.meta.globalLevel.traitPointsPerLevel);
  });
});
