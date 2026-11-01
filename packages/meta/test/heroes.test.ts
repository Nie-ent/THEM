import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun } from '@them/core';
import {
  checkHeroGrowthContent, heroExpToNext, heroGrowth, heroLevelCap, heroLoadout, limitBreakHero, starUpHero, toggleTeamHero, useExpBooks,
} from '../src/heroes';
import { buildRunConfig } from '../src/loadout';
import { SAVE_VERSION } from '../src/migrations';
import { Profile, checkMetaContent } from '../src/profile';
import { MetaError } from '../src/progression';
import { decodeSave } from '../src/save';
import { freshProfile } from './helpers';

const G = content.heroGrowth;
const worldId = content.worlds[0]!.id;
const hero = (p: Profile, id: string) => p.heroes.owned.find((h) => h.heroId === id)!;
function stocked(items: Record<string, number> = {}, gold = 1_000_000): Profile {
  const p = freshProfile();
  return { ...p, items: { ...p.items, ...items }, currencies: { ...p.currencies, gold } };
}
function withHero(p: Profile, id: string, patch: Partial<Profile['heroes']['owned'][number]>): Profile {
  return { ...p, heroes: { ...p.heroes, owned: p.heroes.owned.map((h) => (h.heroId === id ? { ...h, ...patch } : h)) } };
}

describe('hero growth content (GDD §8)', () => {
  it('passes the cross-checks; caps grow with stars; costs for every star', () => {
    expect(checkHeroGrowthContent(content)).toEqual([]);
    expect(checkMetaContent(content)).toEqual([]);
    expect(G.maxStars).toBe(5);
    expect(G.levelCapByStars).toEqual([20, 30, 40, 50, 60]);
  });

  it('hero EXP is an integer formula', () => {
    expect(heroExpToNext(content, 1)).toBe(40 + 10 + 2);
    expect(heroExpToNext(content, 10)).toBe(40 + 100 + 200);
  });
});

describe('levelling with EXP books', () => {
  it('levels up, keeps the remainder and spends the books', () => {
    const p = stocked({ 'exp-book-small': 5 });
    const r = useExpBooks(p, content, 'brann', 'exp-book-small', 2); // 200 EXP: 52 → Lv2, 68 → Lv3, 80 left
    expect(r.used).toBe(2);
    expect(r.levelsGained).toBe(2);
    expect(hero(r.profile, 'brann')).toMatchObject({ level: 3, exp: 200 - 52 - 68 });
    expect(r.profile.items['exp-book-small']).toBe(3);
  });

  it('stops at the star cap without wasting books and drops overflow EXP', () => {
    const p = stocked({ 'exp-book-large': 1000 });
    const r = useExpBooks(p, content, 'brann', 'exp-book-large', 1000);
    const cap = heroLevelCap(content, hero(p, 'brann')); // Brann is 1★ → 20
    expect(cap).toBe(20);
    expect(hero(r.profile, 'brann')).toMatchObject({ level: 20, exp: 0 });
    expect(r.used).toBeLessThan(1000);
    expect(r.profile.items['exp-book-large']).toBe(1000 - r.used);
    expect(() => useExpBooks(r.profile, content, 'brann', 'exp-book-large', 1)).toThrow(/level cap/);
  });

  it('refuses unknown books, missing books, bad counts and unowned heroes', () => {
    const p = stocked({ 'exp-book-small': 1 });
    expect(() => useExpBooks(p, content, 'brann', 'star-shard', 1)).toThrow(/not an EXP book/);
    expect(() => useExpBooks(p, content, 'brann', 'exp-book-small', 2)).toThrow(MetaError);
    expect(() => useExpBooks(p, content, 'brann', 'exp-book-small', 0)).toThrow(/count/);
    expect(() => useExpBooks(p, content, 'ghost', 'exp-book-small', 1)).toThrow(/not owned/);
  });
});

describe('stars and limit breaks', () => {
  it('a 1★ hero can climb to 5★ with shards + gold; the cap rises with each star', () => {
    let p = stocked({ 'star-shard': 1000 });
    for (let s = 2; s <= 5; s++) {
      p = starUpHero(p, content, 'brann');
      expect(hero(p, 'brann').stars).toBe(s);
      expect(heroLevelCap(content, hero(p, 'brann'))).toBe(G.levelCapByStars[s - 1]);
    }
    const spent = G.starUp.reduce((a, s) => a + s.shards, 0);
    expect(p.items['star-shard']).toBe(1000 - spent);
    expect(() => starUpHero(p, content, 'brann')).toThrow(/already 5★/);
    expect(() => starUpHero(stocked(), content, 'brann')).toThrow(/needs/);
  });

  it('limit break needs the hero at cap and essence + gold; raises the cap', () => {
    const p0 = stocked({ 'essence-garroth': 100 });
    expect(() => limitBreakHero(p0, content, 'brann')).toThrow(/level cap first/);
    let p = withHero(p0, 'brann', { level: 20 });
    p = limitBreakHero(p, content, 'brann');
    expect(hero(p, 'brann').limitBreaks).toBe(1);
    expect(heroLevelCap(content, hero(p, 'brann'))).toBe(20 + G.limitBreaks[0]!.capAdd);
    expect(p.items['essence-garroth']).toBe(100 - G.limitBreaks[0]!.items['essence-garroth']!);
    p = withHero(p, 'brann', { level: 25 });
    p = limitBreakHero(p, content, 'brann');
    p = withHero(p, 'brann', { level: 30 });
    expect(() => limitBreakHero(p, content, 'brann')).toThrow(/no limit break left/);
  });
});

describe('team', () => {
  it('toggles heroes in and out, respecting the team size', () => {
    let p = freshProfile();
    p = toggleTeamHero(p, content, 'mira');
    expect(p.heroes.team).toEqual(['brann']);
    p = toggleTeamHero(p, content, 'mira');
    expect(p.heroes.team).toEqual(['brann', 'mira']);
    const full = { ...p, heroes: { ...p.heroes, team: ['a', 'b', 'c', 'd'] } };
    expect(() => toggleTeamHero(full, content, 'mira')).toThrow(/team already has/);
    expect(() => toggleTeamHero(p, content, 'ghost')).toThrow(/not owned/);
  });
});

describe('heroes in the run', () => {
  it('a fresh team adds nothing (Phase 1 parity)', () => {
    expect(heroLoadout(freshProfile(), content)).toEqual({ allyMods: {} });
    expect(buildRunConfig(freshProfile(), content, { worldId }).loadout).toEqual({ mods: {} });
  });

  it('level and stars above base become allyMods and change the AI hero in core', () => {
    const p = withHero(withHero(freshProfile(), 'brann', { level: 11, stars: 3 }), 'mira', { level: 1 });
    // Brann: 10 levels × (4% HP, 3% dmg) + 2 stars × 20% → HP +80%, damage +70%
    expect(heroGrowth(content, hero(p, 'brann'))).toEqual({ hpMult: 0.8, damageMult: 0.7 });
    const cfg = buildRunConfig(p, content, { worldId });
    expect(cfg.loadout?.allyMods).toEqual({ brann: { hpMult: 0.8, damageMult: 0.7 } });
    const run = createRun(cfg, content, 1);
    const i = run.allies[run.allyDefs.findIndex((d) => content.heroes[d]!.id === 'brann')]!;
    const base = content.heroes.find((h) => h.id === 'brann')!;
    expect(run.w.maxHp[i]).toBeCloseTo(base.hp * 1.8, 9);
    expect(run.w.wDamage[i]).toBeCloseTo(base.weapon.damage * 1.7, 9);
  });

  it('heroes outside the team give nothing; ranked normalises level, keeps stars', () => {
    let p = withHero(freshProfile(), 'brann', { level: 20, stars: 2 });
    expect(heroGrowth(content, hero(p, 'brann'), true)).toEqual({
      hpMult: Math.round((G.perLevel.hpMult * (Math.min(G.rankedLevel, 30) - 1) + G.perStar.hpMult) * 1e9) / 1e9,
      damageMult: Math.round((G.perLevel.damageMult * (Math.min(G.rankedLevel, 30) - 1) + G.perStar.damageMult) * 1e9) / 1e9,
    });
    p = { ...p, heroes: { ...p.heroes, team: ['mira'] } };
    expect(heroLoadout(p, content).allyMods).toEqual({});
  });
});

describe('save v2 → v3 migration (real v2 save)', () => {
  const v2 = readFileSync(new URL('./fixtures/save-v2.json', import.meta.url), 'utf8');

  it('adds limitBreaks 0 to every hero and keeps everything else', () => {
    expect(SAVE_VERSION).toBe(3);
    const raw = JSON.parse(v2) as { version: number; profile: { heroes: { owned: object[] } } & Record<string, unknown> };
    expect(raw.version).toBe(2);
    const r = decodeSave(v2);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.migratedFrom).toBe(2);
    expect(r.profile.heroes.owned).toEqual(raw.profile.heroes.owned.map((h) => ({ ...h, limitBreaks: 0 })));
    const { heroes: _a, ...restOld } = raw.profile;
    const { heroes: _b, ...restNew } = r.profile;
    expect(restNew).toEqual(restOld);
    expect(Profile.safeParse(r.profile).success).toBe(true);
  });
});
