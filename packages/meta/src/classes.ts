/**
 * Classes (GDD §6) — P2-04. Data: `content/data/classes.json`.
 *
 * - Tier 1 at Global Level 10 (warrior, mage, ranger, marshal); tier 2 at Lv 35, two per tier-1 class.
 * - `profile.classId` holds the highest class; the chain (tier 1 → tier 2) is derived from `parent`.
 * - A class brings passive mods, unlocks its exclusive cards in the run draft, raises the draft
 *   weight of shared cards that fit it, and opens its class trait nodes (traits.json kind "class").
 * - First pick and promotion to a child class are free; any other change costs
 *   `change.cost` × `change.itemId` and refunds class trait nodes the new chain does not include.
 *
 * Pure: functions return a new profile.
 */
import type { ClassDef, ContentBundle } from '@them/content';
import type { Mods } from '@them/core';
import type { LoadoutContributor, LoadoutPart } from './loadout';
import { MetaError } from './progression';
import type { Profile } from './profile';

export function classDef(content: ContentBundle, id: string): ClassDef | undefined {
  return content.classes.classes.find((c) => c.id === id);
}

/** The class and its ancestors, lowest tier first. Empty for null / unknown. */
export function classChain(content: ContentBundle, id: string | null): ClassDef[] {
  const out: ClassDef[] = [];
  let c = id === null ? undefined : classDef(content, id);
  for (let guard = 0; c && guard < 8; guard++) {
    out.unshift(c);
    c = c.parent ? classDef(content, c.parent) : undefined;
  }
  return out;
}

export function tierLevel(content: ContentBundle, tier: number): number {
  const t = content.classes.tiers.find((x) => x.tier === tier);
  return t ? t.level : Number.POSITIVE_INFINITY;
}

export type ClassBlock = 'unknown' | 'level' | 'tier-1-first' | 'same' | 'not-enough-items';

/** Items needed to switch to `id` now: 0 for the first pick or a promotion to a child class. */
export function classChangeCost(profile: Profile, content: ContentBundle, id: string): number {
  const target = classDef(content, id);
  if (profile.classId === null || !target) return 0;
  if (target.parent === profile.classId) return 0;
  return content.classes.change.cost;
}

export function classBlock(profile: Profile, content: ContentBundle, id: string): ClassBlock | null {
  const target = classDef(content, id);
  if (!target) return 'unknown';
  if (profile.classId === id) return 'same';
  if (profile.level < tierLevel(content, target.tier)) return 'level';
  if (profile.classId === null && target.parent) return 'tier-1-first';
  const cost = classChangeCost(profile, content, id);
  if ((profile.items[content.classes.change.itemId] ?? 0) < cost) return 'not-enough-items';
  return null;
}

/** Pick, promote or change class. Throws MetaError with the block reason. */
export function setClass(profile: Profile, content: ContentBundle, id: string): Profile {
  const block = classBlock(profile, content, id);
  if (block) throw new MetaError(block === 'not-enough-items' ? 'not-enough-items' : 'class-locked', `setClass ${id}: ${block}`);
  const cost = classChangeCost(profile, content, id);
  const p = structuredClone(profile);
  p.classId = id;
  if (cost > 0) {
    const item = content.classes.change.itemId;
    p.items[item] = (p.items[item] ?? 0) - cost;
  }
  // Refund class trait nodes the new chain does not hold.
  const held = new Set(classChain(content, id).map((c) => c.id));
  for (const d of content.traits.nodes) {
    const r = p.traits.nodes[d.id] ?? 0;
    if (r > 0 && d.requiresClass !== undefined && !held.has(d.requiresClass)) {
      p.traits.unspentPoints += r * d.cost;
      delete p.traits.nodes[d.id];
    }
  }
  return p;
}

/** What the class chain brings into a run. */
export function classLoadout(profile: Profile, content: ContentBundle): LoadoutPart {
  const mods: Record<string, number> = {};
  const cardWeights: Record<string, number> = {};
  const unlock = new Set<string>();
  for (const c of classChain(content, profile.classId)) {
    for (const k of Object.keys(c.mods).sort()) mods[k] = (mods[k] ?? 0) + c.mods[k]!;
    for (const k of Object.keys(c.cardWeights).sort()) cardWeights[k] = (cardWeights[k] ?? 1) * c.cardWeights[k]!;
    for (const id of c.cards) unlock.add(id);
  }
  for (const k of Object.keys(mods)) mods[k] = Math.round(mods[k]! * 1e9) / 1e9;
  return { mods: mods as Partial<Record<keyof Mods, number>>, cardWeights, unlockCards: [...unlock].sort() };
}

export const classContributor: LoadoutContributor = (profile, content) => classLoadout(profile, content);

export function checkClassesContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const C = content.classes;
  const ids = new Set<string>();
  const branches = new Set(content.traits.branches.map((b) => b.id));
  const cardOwner = new Map<string, string>();
  for (const c of C.classes) {
    if (ids.has(c.id)) out.push(`classes: duplicate id "${c.id}"`);
    ids.add(c.id);
  }
  for (const c of C.classes) {
    if (!C.tiers.some((t) => t.tier === c.tier)) out.push(`classes.${c.id}: tier ${c.tier} has no unlock level`);
    if (c.tier === 1 && c.parent) out.push(`classes.${c.id}: tier 1 cannot have a parent`);
    if (c.tier > 1) {
      const parent = c.parent ? C.classes.find((x) => x.id === c.parent) : undefined;
      if (!parent) out.push(`classes.${c.id}: tier ${c.tier} needs a known parent`);
      else if (parent.tier !== c.tier - 1) out.push(`classes.${c.id}: parent "${parent.id}" is not tier ${c.tier - 1}`);
    }
    if (!branches.has(c.branch)) out.push(`classes.${c.id}: unknown branch "${c.branch}"`);
    for (const card of c.cards) {
      const d = content.cards.find((x) => x.id === card);
      if (!d) out.push(`classes.${c.id}: unknown card "${card}"`);
      else if (!d.exclusive) out.push(`classes.${c.id}: card "${card}" must be exclusive`);
      if (cardOwner.has(card)) out.push(`classes.${c.id}: card "${card}" already belongs to ${cardOwner.get(card)}`);
      cardOwner.set(card, c.id);
    }
    for (const card of Object.keys(c.cardWeights)) if (!content.cards.some((x) => x.id === card)) out.push(`classes.${c.id}: cardWeights unknown card "${card}"`);
  }
  for (const card of content.cards) if (card.exclusive && !cardOwner.has(card.id)) out.push(`cards.${card.id}: exclusive but no class unlocks it`);
  if (!content.meta.items.some((i) => i.id === C.change.itemId)) out.push(`classes.change.itemId: "${C.change.itemId}" is not in meta.items`);
  for (const d of content.traits.nodes) {
    if (d.kind === 'class' && d.requiresClass === undefined) out.push(`traits.${d.id}: class node needs requiresClass`);
    if (d.requiresClass !== undefined && !ids.has(d.requiresClass)) out.push(`traits.${d.id}: requiresClass unknown "${d.requiresClass}"`);
  }
  return out;
}
