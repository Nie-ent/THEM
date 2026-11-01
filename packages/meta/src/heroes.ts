/**
 * AI hero growth (GDD §8) — P2-07. Data: `content/data/hero-growth.json`.
 *
 * - Hero level: raised with EXP books, up to a cap set by stars (`levelCapByStars`) plus world-essence
 *   limit breaks (`limitBreaks`, each needs the hero at its current cap).
 * - Stars 1★ → maxStars★ with star shards + gold (`starUp`): a 1★ hero can reach the top, it just
 *   takes longer (GDD §8).
 * - Growth = perLevel × (level − 1) + perStar × (stars − the hero's content stars), as fractions on
 *   the hero's base HP and weapon damage → core `Loadout.allyMods` for heroes in the team.
 * - Ranked: every hero counts as `rankedLevel` (capped by its own cap); stars still count (GDD §8).
 *
 * Pure: functions return a new profile.
 */
import type { ContentBundle } from '@them/content';
import type { LoadoutContributor, LoadoutPart } from './loadout';
import { teamFor } from './team';
import { MetaError } from './progression';
import type { HeroInstance, Profile } from './profile';

function instance(profile: Profile, heroId: string): HeroInstance {
  const h = profile.heroes.owned.find((x) => x.heroId === heroId);
  if (!h) throw new MetaError('unknown-hero', `hero "${heroId}" is not owned`);
  return h;
}

/** EXP from hero level `level` to `level + 1` (integer formula from content). */
export function heroExpToNext(content: ContentBundle, level: number): number {
  const e = content.heroGrowth.exp;
  return e.base + e.linear * level + e.quadratic * level * level;
}

export function heroLevelCap(content: ContentBundle, h: Pick<HeroInstance, 'stars' | 'limitBreaks'>): number {
  const g = content.heroGrowth;
  const base = g.levelCapByStars[Math.min(h.stars, g.levelCapByStars.length) - 1] ?? 1;
  let cap = base;
  for (let i = 0; i < Math.min(h.limitBreaks, g.limitBreaks.length); i++) cap += g.limitBreaks[i]!.capAdd;
  return cap;
}

/**
 * Feed up to `count` EXP books of one kind to a hero. Books are used one at a time and only while
 * the hero is below its cap; EXP past the cap is dropped. Returns how many books were used.
 */
export function useExpBooks(
  profile: Profile, content: ContentBundle, heroId: string, bookId: string, count: number,
): { profile: Profile; used: number; levelsGained: number } {
  const per = content.heroGrowth.expBooks[bookId];
  if (per === undefined) throw new MetaError('unknown-item', `useExpBooks: "${bookId}" is not an EXP book`);
  if (!Number.isInteger(count) || count < 1) throw new MetaError('bad-amount', 'useExpBooks: count must be a whole number ≥ 1');
  const have = profile.items[bookId] ?? 0;
  if (have < count) throw new MetaError('not-enough-items', `useExpBooks: have ${have} ${bookId}`);
  const cur = instance(profile, heroId);
  const cap = heroLevelCap(content, cur);
  if (cur.level >= cap) throw new MetaError('hero-capped', `useExpBooks: ${heroId} is at its level cap ${cap}`);

  const p = structuredClone(profile);
  const h = instance(p, heroId);
  let used = 0, gained = 0;
  while (used < count && h.level < cap) {
    used++;
    h.exp += per;
    while (h.level < cap && h.exp >= heroExpToNext(content, h.level)) {
      h.exp -= heroExpToNext(content, h.level);
      h.level++;
      gained++;
    }
  }
  if (h.level >= cap) h.exp = 0;
  p.items[bookId] = have - used;
  return { profile: p, used, levelsGained: gained };
}

/** Raise a hero one star (star shards + gold). */
export function starUpHero(profile: Profile, content: ContentBundle, heroId: string): Profile {
  const g = content.heroGrowth;
  const cur = instance(profile, heroId);
  if (cur.stars >= g.maxStars) throw new MetaError('hero-capped', `starUpHero: ${heroId} is already ${g.maxStars}★`);
  const step = g.starUp.find((s) => s.to === cur.stars + 1);
  if (!step) throw new MetaError('hero-capped', `starUpHero: no cost for ${cur.stars + 1}★`);
  const shards = profile.items[g.shardItemId] ?? 0, gold = profile.currencies[g.goldCurrency] ?? 0;
  if (shards < step.shards || gold < step.gold) throw new MetaError('not-enough-items', `starUpHero: needs ${step.shards} shards and ${step.gold} gold`);
  const p = structuredClone(profile);
  p.items[g.shardItemId] = shards - step.shards;
  p.currencies[g.goldCurrency] = gold - step.gold;
  instance(p, heroId).stars++;
  return p;
}

/** Break the level limit with world essence (hero must be at its current cap). */
export function limitBreakHero(profile: Profile, content: ContentBundle, heroId: string): Profile {
  const g = content.heroGrowth;
  const cur = instance(profile, heroId);
  const step = g.limitBreaks[cur.limitBreaks];
  if (!step) throw new MetaError('hero-capped', `limitBreakHero: ${heroId} has no limit break left`);
  if (cur.level < heroLevelCap(content, cur)) throw new MetaError('hero-not-capped', `limitBreakHero: ${heroId} must reach its level cap first`);
  const gold = profile.currencies[g.goldCurrency] ?? 0;
  if (gold < step.gold) throw new MetaError('not-enough-items', `limitBreakHero: needs ${step.gold} gold`);
  for (const [item, n] of Object.entries(step.items)) {
    if ((profile.items[item] ?? 0) < n) throw new MetaError('not-enough-items', `limitBreakHero: needs ${n} ${item}`);
  }
  const p = structuredClone(profile);
  for (const [item, n] of Object.entries(step.items)) p.items[item] = (p.items[item] ?? 0) - n;
  p.currencies[g.goldCurrency] = gold - step.gold;
  instance(p, heroId).limitBreaks++;
  return p;
}

/** Add an owned hero to the team (end of the order) or take it out. Throws when the team is full. */
export function toggleTeamHero(profile: Profile, content: ContentBundle, heroId: string): Profile {
  instance(profile, heroId);
  const p = structuredClone(profile);
  if (p.heroes.team.includes(heroId)) {
    p.heroes.team = p.heroes.team.filter((id) => id !== heroId);
    return p;
  }
  if (p.heroes.team.length >= content.meta.maxTeamSize) throw new MetaError('team-full', `toggleTeamHero: team already has ${content.meta.maxTeamSize}`);
  p.heroes.team.push(heroId);
  return p;
}

/** Growth fractions for one hero (level, stars). `ranked`: level normalised to rankedLevel. */
export function heroGrowth(content: ContentBundle, h: HeroInstance, ranked = false): { hpMult: number; damageMult: number } {
  const g = content.heroGrowth;
  const def = content.heroes.find((x) => x.id === h.heroId);
  const baseStars = def?.stars ?? h.stars;
  const level = ranked ? Math.min(g.rankedLevel, heroLevelCap(content, h)) : h.level;
  const lv = Math.max(0, level - 1), st = Math.max(0, h.stars - baseStars);
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  return {
    hpMult: r(g.perLevel.hpMult * lv + g.perStar.hpMult * st),
    damageMult: r(g.perLevel.damageMult * lv + g.perStar.damageMult * st),
  };
}

/** allyMods for the heroes the profile brings (zeros omitted, so a fresh team adds nothing). */
export function heroLoadout(profile: Profile, content: ContentBundle, ranked = false): LoadoutPart {
  const allyMods: Record<string, { hpMult?: number; damageMult?: number }> = {};
  for (const id of teamFor(profile, content)) {
    const h = profile.heroes.owned.find((x) => x.heroId === id);
    if (!h) continue;
    const gr = heroGrowth(content, h, ranked);
    const m: { hpMult?: number; damageMult?: number } = {};
    if (gr.hpMult !== 0) m.hpMult = gr.hpMult;
    if (gr.damageMult !== 0) m.damageMult = gr.damageMult;
    if (Object.keys(m).length > 0) allyMods[id] = m;
  }
  return { allyMods };
}

export const heroesContributor: LoadoutContributor = (profile, content, ctx) => heroLoadout(profile, content, ctx?.ranked ?? false);

export function checkHeroGrowthContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const g = content.heroGrowth;
  const items = new Set(content.meta.items.map((i) => i.id));
  if (g.levelCapByStars.length !== g.maxStars) out.push(`heroGrowth.levelCapByStars: ${g.levelCapByStars.length} entries, maxStars ${g.maxStars}`);
  for (let i = 1; i < g.levelCapByStars.length; i++) if (g.levelCapByStars[i]! <= g.levelCapByStars[i - 1]!) out.push('heroGrowth.levelCapByStars: must increase');
  for (let s = 2; s <= g.maxStars; s++) if (!g.starUp.some((x) => x.to === s)) out.push(`heroGrowth.starUp: missing cost for ${s}★`);
  for (const id of [g.shardItemId, ...Object.keys(g.expBooks)]) if (!items.has(id)) out.push(`heroGrowth: "${id}" is not in meta.items`);
  for (const lb of g.limitBreaks) for (const id of Object.keys(lb.items)) if (!items.has(id)) out.push(`heroGrowth.limitBreaks: "${id}" is not in meta.items`);
  if (!content.meta.currencies.some((c) => c.id === g.goldCurrency)) out.push(`heroGrowth.goldCurrency: unknown "${g.goldCurrency}"`);
  for (const h of content.heroes) if (h.stars > g.maxStars) out.push(`heroes.${h.id}: ${h.stars}★ above maxStars`);
  return out;
}
