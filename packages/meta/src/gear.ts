/**
 * Equipment and enhancement (GDD §4, §8, §12) — P2-06. Data: `content/data/gear.json`.
 *
 * - Items sit in slots (weapon, armour, accessory); worn items give `mods` + `perEnhance` × level,
 *   and pieces of one set give stacking set bonuses.
 * - Enhancement +0 → +15. Each attempt costs stones and gold (step table). Up to +10 it always works;
 *   from +10 a failure keeps the level, from +11 a failure drops one level 50% of the time unless a
 *   protection scroll is used (materials are lost either way). Expected attempts +10 → +15: 40.3
 *   without scrolls, 14.5 with a scroll every time (GDD: about 40 and 15).
 * - Rolls come only from the injected `RollSource`, so enhancement can move server-side.
 * - Ranked: every item counts as `enhance.rankedLevel` (GDD §8: enhancement is normalised).
 *
 * Pure: functions return a new profile.
 */
import type { ContentBundle, GearItemDef } from '@them/content';
import type { Mods } from '@them/core';
import { rollId, type RollSource } from './env';
import type { LoadoutContributor, LoadoutPart } from './loadout';
import { MetaError } from './progression';
import type { GearItem, Profile } from './profile';

export function gearDef(content: ContentBundle, itemId: string): GearItemDef | undefined {
  return content.gear.items.find((i) => i.id === itemId);
}

function owned(profile: Profile, uid: string): GearItem {
  const g = profile.gear.items.find((x) => x.uid === uid);
  if (!g) throw new MetaError('unknown-gear', `no gear with uid "${uid}"`);
  return g;
}

/** Add a new +0 item to the inventory. */
export function grantGear(profile: Profile, content: ContentBundle, itemId: string, rolls: RollSource): { profile: Profile; uid: string } {
  if (!gearDef(content, itemId)) throw new MetaError('unknown-gear', `grantGear: unknown item "${itemId}"`);
  const p = structuredClone(profile);
  let uid = rollId(rolls);
  while (p.gear.items.some((g) => g.uid === uid)) uid = rollId(rolls);
  p.gear.items.push({ uid, itemId, enhance: 0 });
  return { profile: p, uid };
}

/** Wear an owned item in its slot (replacing what was there). */
export function equipGear(profile: Profile, content: ContentBundle, uid: string): Profile {
  const g = owned(profile, uid);
  const def = gearDef(content, g.itemId);
  if (!def) throw new MetaError('unknown-gear', `equipGear: item "${g.itemId}" is not in content`);
  if (profile.gear.equipped[def.slot] === uid) return profile;
  const p = structuredClone(profile);
  p.gear.equipped[def.slot] = uid;
  return p;
}

export function unequipSlot(profile: Profile, slot: string): Profile {
  if (profile.gear.equipped[slot] === undefined) return profile;
  const p = structuredClone(profile);
  delete p.gear.equipped[slot];
  return p;
}

export interface EnhanceInfo {
  level: number;
  /** null at the max level. */
  next: { chance: number; dropChance: number; stones: number; gold: number } | null;
  stones: number;
  gold: number;
  scrolls: number;
  canAfford: boolean;
}

export function enhanceInfo(profile: Profile, content: ContentBundle, uid: string): EnhanceInfo {
  const e = content.gear.enhance;
  const g = owned(profile, uid);
  const step = g.enhance < e.maxLevel ? e.steps[g.enhance] ?? null : null;
  const stones = profile.items[e.stoneItemId] ?? 0;
  const gold = profile.currencies[e.goldCurrency] ?? 0;
  return {
    level: g.enhance,
    next: step,
    stones,
    gold,
    scrolls: profile.items[e.protectItemId] ?? 0,
    canAfford: step !== null && stones >= step.stones && gold >= step.gold,
  };
}

export type EnhanceOutcome = 'success' | 'fail' | 'fail-drop' | 'fail-protected';

/**
 * One enhancement attempt. `protect` spends a protection scroll, but only on attempts that can drop
 * a level. Throws MetaError at max level, when materials are short, or when protect has no scroll.
 */
export function enhanceGear(
  profile: Profile,
  content: ContentBundle,
  uid: string,
  rolls: RollSource,
  opts: { protect?: boolean } = {},
): { profile: Profile; outcome: EnhanceOutcome; level: number } {
  const e = content.gear.enhance;
  const info = enhanceInfo(profile, content, uid);
  const step = info.next;
  if (!step) throw new MetaError('max-enhance', `enhanceGear: already +${info.level}`);
  if (!info.canAfford) throw new MetaError('not-enough-items', `enhanceGear: needs ${step.stones} stones and ${step.gold} gold`);
  const useScroll = opts.protect === true && step.dropChance > 0;
  if (useScroll && info.scrolls < 1) throw new MetaError('not-enough-items', 'enhanceGear: no protection scroll');

  const p = structuredClone(profile);
  p.items[e.stoneItemId] = info.stones - step.stones;
  p.currencies[e.goldCurrency] = info.gold - step.gold;
  if (useScroll) p.items[e.protectItemId] = info.scrolls - 1;
  const g = p.gear.items.find((x) => x.uid === uid)!;

  let outcome: EnhanceOutcome;
  if (step.chance >= 1 || rolls.float() < step.chance) {
    g.enhance++;
    outcome = 'success';
  } else if (step.dropChance <= 0) {
    outcome = 'fail';
  } else if (useScroll) {
    outcome = 'fail-protected';
  } else if (rolls.float() < step.dropChance) {
    g.enhance = Math.max(0, g.enhance - 1);
    outcome = 'fail-drop';
  } else {
    outcome = 'fail';
  }
  return { profile: p, outcome, level: g.enhance };
}

/** Worn items + set bonuses as run modifiers. Zero values are dropped (an untouched starter kit adds nothing). */
export function gearLoadout(profile: Profile, content: ContentBundle, ranked = false): LoadoutPart {
  const mods: Record<string, number> = {};
  const add = (m: Record<string, number>, times = 1) => { for (const k of Object.keys(m).sort()) mods[k] = (mods[k] ?? 0) + m[k]! * times; };
  const setCount = new Map<string, number>();
  for (const slot of content.gear.slots.map((s) => s.id)) {
    const uid = profile.gear.equipped[slot];
    if (uid === undefined) continue;
    const g = profile.gear.items.find((x) => x.uid === uid);
    const def = g ? gearDef(content, g.itemId) : undefined;
    if (!g || !def || def.slot !== slot) continue;
    const level = ranked ? content.gear.enhance.rankedLevel : g.enhance;
    add(def.mods);
    add(def.perEnhance, level);
    if (def.set) setCount.set(def.set, (setCount.get(def.set) ?? 0) + 1);
  }
  for (const set of content.gear.sets) {
    const n = setCount.get(set.id) ?? 0;
    for (const b of set.bonuses) if (n >= b.pieces) add(b.mods);
  }
  for (const k of Object.keys(mods)) {
    mods[k] = Math.round(mods[k]! * 1e9) / 1e9;
    if (mods[k] === 0) delete mods[k];
  }
  return { mods: mods as Partial<Record<keyof Mods, number>> };
}

export const gearContributor: LoadoutContributor = (profile, content, ctx) => gearLoadout(profile, content, ctx?.ranked ?? false);

/** Starting kit for a new profile: owned and worn. */
export function withStartingGear(profile: Profile, content: ContentBundle, rolls: RollSource): Profile {
  let p = profile;
  for (const id of content.gear.starting) {
    const r = grantGear(p, content, id, rolls);
    p = equipGear(r.profile, content, r.uid);
  }
  return p;
}

export function checkGearContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const G = content.gear;
  const slots = new Set(G.slots.map((s) => s.id));
  const sets = new Set(G.sets.map((s) => s.id));
  const items = new Set(content.meta.items.map((i) => i.id));
  const ids = new Set<string>();
  for (const i of G.items) {
    if (ids.has(i.id)) out.push(`gear.items: duplicate id "${i.id}"`);
    ids.add(i.id);
    if (!slots.has(i.slot)) out.push(`gear.${i.id}: unknown slot "${i.slot}"`);
    if (i.set !== undefined && !sets.has(i.set)) out.push(`gear.${i.id}: unknown set "${i.set}"`);
  }
  const startSlots = new Set<string>();
  for (const id of G.starting) {
    const d = G.items.find((x) => x.id === id);
    if (!d) { out.push(`gear.starting: unknown item "${id}"`); continue; }
    if (startSlots.has(d.slot)) out.push(`gear.starting: two items for slot "${d.slot}"`);
    startSlots.add(d.slot);
    if (Object.values(d.mods).some((v) => v !== 0)) out.push(`gear.starting: "${id}" must have no base mods (new profiles play like Phase 1)`);
  }
  const e = G.enhance;
  if (e.steps.length !== e.maxLevel) out.push(`gear.enhance.steps: ${e.steps.length} steps, maxLevel ${e.maxLevel} needs ${e.maxLevel}`);
  if (e.rankedLevel > e.maxLevel) out.push('gear.enhance.rankedLevel: above maxLevel');
  for (const id of [e.stoneItemId, e.protectItemId]) if (!items.has(id)) out.push(`gear.enhance: "${id}" is not in meta.items`);
  if (!content.meta.currencies.some((c) => c.id === e.goldCurrency)) out.push(`gear.enhance.goldCurrency: unknown currency "${e.goldCurrency}"`);
  for (const w of content.worlds) for (const id of Object.keys(w.rewardItems)) if (!items.has(id)) out.push(`worlds.${w.id}.rewardItems: "${id}" is not in meta.items`);
  return out;
}
