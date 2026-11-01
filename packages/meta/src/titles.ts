/**
 * Titles (GDD §7) — P2-05. Data: `content/data/titles.json`.
 *
 * - Earned from achievements: run conditions are checked when a run is recorded
 *   (`applyRunOutcome`), profile conditions whenever `unlockTitles` runs. Call `unlockTitles` after
 *   any profile action that can satisfy one (class pick, level-up outside a run).
 * - One main title can be equipped for its bonus; the number of titles held gives a permanent
 *   account bonus (`collection` tiers stack). Cosmetic titles give nothing and do not count.
 * - Ranked turns every title bonus off (`RunRequest.ranked`).
 *
 * Pure: functions return a new profile.
 */
import type { ContentBundle, Grade, TitleCondition, TitleDef } from '@them/content';
import type { Mods } from '@them/core';
import { classChain } from './classes';
import type { LoadoutContributor, LoadoutPart } from './loadout';
import { MetaError } from './progression';
import type { Profile } from './profile';
import type { RunOutcome } from './rewards';

const GRADE_RANK: Record<Grade, number> = { S: 0, A: 1, B: 2, C: 3 };

function runMatches(c: TitleCondition, o: RunOutcome): boolean {
  if (o.result !== 'win') return false;
  if ('worldId' in c && c.worldId !== undefined && c.worldId !== o.worldId) return false;
  switch (c.type) {
    case 'worldCleared': return c.difficulty === undefined || c.difficulty === o.difficulty;
    case 'runGrade': return GRADE_RANK[o.score.grade] <= GRADE_RANK[c.grade];
    case 'flawlessWin': return o.facts !== undefined && o.facts.heroDamageFrac <= c.maxHeroDamageFrac;
    case 'soloWin': return o.facts !== undefined && o.facts.allies === 0;
    case 'coreIntactWin': return o.facts !== undefined && o.facts.coreHpFrac >= c.minCoreHpFrac - 1e-9;
    default: return false;
  }
}

function profileMatches(c: TitleCondition, p: Profile, content: ContentBundle): boolean {
  switch (c.type) {
    case 'totalRuns': return p.totals.runs >= c.min;
    case 'totalWins': return p.totals.wins >= c.min;
    case 'totalKills': return p.totals.kills >= c.min;
    case 'globalLevel': return p.level >= c.min;
    case 'classTier': return classChain(content, p.classId).some((x) => x.tier >= c.min);
    default: return false;
  }
}

/** Does the profile (after this run, if given) meet the title's condition? */
export function titleEarned(def: TitleDef, profile: Profile, content: ContentBundle, outcome?: RunOutcome): boolean {
  return profileMatches(def.condition, profile, content) || (outcome !== undefined && runMatches(def.condition, outcome));
}

/** Unlock every title now earned. Returns the same profile object when nothing is new. */
export function unlockTitles(profile: Profile, content: ContentBundle, outcome?: RunOutcome): { profile: Profile; unlocked: string[] } {
  const have = new Set(profile.titles.unlocked);
  const fresh = content.titles.titles.filter((t) => !have.has(t.id) && titleEarned(t, profile, content, outcome)).map((t) => t.id);
  if (fresh.length === 0) return { profile, unlocked: [] };
  const p = structuredClone(profile);
  p.titles.unlocked = [...p.titles.unlocked, ...fresh];
  return { profile: p, unlocked: fresh };
}

/** Equip an unlocked title as the main title (null = none). */
export function equipTitle(profile: Profile, content: ContentBundle, id: string | null): Profile {
  if (id !== null) {
    if (!content.titles.titles.some((t) => t.id === id)) throw new MetaError('unknown-title', `equipTitle: unknown title "${id}"`);
    if (!profile.titles.unlocked.includes(id)) throw new MetaError('title-locked', `equipTitle: "${id}" is not unlocked`);
  }
  if (profile.titles.equipped === id) return profile;
  const p = structuredClone(profile);
  p.titles.equipped = id;
  return p;
}

/** Titles that count toward the collection bonus (unlocked, known, not cosmetic). */
export function countedTitles(profile: Profile, content: ContentBundle): number {
  return profile.titles.unlocked.filter((id) => content.titles.titles.some((t) => t.id === id && !t.cosmetic)).length;
}

/** Equipped title bonus + collection tiers reached. Nothing in ranked. */
export function titleLoadout(profile: Profile, content: ContentBundle, ranked = false): LoadoutPart {
  const mods: Record<string, number> = {};
  if (ranked) return { mods };
  const add = (m: Record<string, number>) => { for (const k of Object.keys(m).sort()) mods[k] = (mods[k] ?? 0) + m[k]!; };
  const eq = profile.titles.equipped;
  const def = eq !== null && profile.titles.unlocked.includes(eq) ? content.titles.titles.find((t) => t.id === eq) : undefined;
  if (def && !def.cosmetic) add(def.mods);
  const n = countedTitles(profile, content);
  for (const tier of content.titles.collection) if (n >= tier.count) add(tier.mods);
  for (const k of Object.keys(mods)) mods[k] = Math.round(mods[k]! * 1e9) / 1e9;
  return { mods: mods as Partial<Record<keyof Mods, number>> };
}

export const titlesContributor: LoadoutContributor = (profile, content, ctx) => titleLoadout(profile, content, ctx?.ranked ?? false);

export function checkTitlesContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const worlds = new Set(content.worlds.map((w) => w.id));
  for (const t of content.titles.titles) {
    if (ids.has(t.id)) out.push(`titles: duplicate id "${t.id}"`);
    ids.add(t.id);
    if (t.cosmetic && Object.keys(t.mods).length > 0) out.push(`titles.${t.id}: cosmetic titles cannot give bonuses`);
    const c = t.condition;
    if ('worldId' in c && c.worldId !== undefined && !worlds.has(c.worldId)) out.push(`titles.${t.id}: unknown world "${c.worldId}"`);
  }
  let last = 0;
  for (const tier of content.titles.collection) {
    if (tier.count <= last) out.push('titles.collection: counts must increase');
    last = tier.count;
  }
  return out;
}
