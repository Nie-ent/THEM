/**
 * Global Level and stats (GDD §4, §12) — P2-02.
 *
 * - EXP to the next level comes from the content table `meta.globalLevel.expToNext`
 *   (20 × L^2.2; Lv 10 ≈ 45 runs, Lv 35 ≈ 980, Lv 50 ≈ 2,230 at grade A).
 * - Each level gives `statPointsPerLevel` stat points and `traitPointsPerLevel` trait points.
 * - Allocated stats become run modifiers through `statsContributor` (per point × points, capped).
 * - Stat reset is free up to `freeRespecUntilLevel`; paid partial respec comes with P2-03.
 *
 * Everything is pure: functions return a new profile.
 */
import type { ContentBundle } from '@them/content';
import type { Mods } from '@them/core';
import type { LoadoutContributor } from './loadout';
import { STAT_IDS, type Profile, type StatId } from './profile';

export class MetaError extends Error {
  constructor(
    readonly code: 'not-enough-points' | 'bad-amount' | 'respec-not-free' | 'unknown-trait' | 'trait-locked' | 'not-enough-items' | 'class-locked'
      | 'unknown-title' | 'title-locked',
    message: string,
  ) {
    super(message);
    this.name = 'MetaError';
  }
}

/** EXP needed from `level` to `level + 1`, or null at the level cap. */
export function expToNext(content: ContentBundle, level: number): number | null {
  const g = content.meta.globalLevel;
  if (level >= g.cap) return null;
  return g.expToNext[level - 1] ?? null;
}

/** Account EXP for a run at `factor` of the grade-A reward (grade %, loss scaling): floor((base + perLevel × L) × factor). */
export function runExpFor(content: ContentBundle, level: number, factor: number): number {
  const r = content.meta.runExp;
  return Math.floor(Math.round((r.base + r.perLevel * level) * factor * 1e9) / 1e9);
}

export interface ExpResult {
  profile: Profile;
  levelsGained: number;
}

/** Add account EXP: levels up as many times as it pays for, granting stat and trait points. EXP past the cap is dropped. */
export function grantExp(profile: Profile, content: ContentBundle, amount: number): ExpResult {
  if (!(amount > 0)) return { profile, levelsGained: 0 };
  const g = content.meta.globalLevel;
  const p = structuredClone(profile);
  p.exp += Math.floor(amount);
  let gained = 0;
  for (let need = expToNext(content, p.level); need !== null && p.exp >= need; need = expToNext(content, p.level)) {
    p.exp -= need;
    p.level++;
    gained++;
    p.unspentStatPoints += g.statPointsPerLevel;
    p.traits.unspentPoints += g.traitPointsPerLevel;
  }
  if (p.level >= g.cap) p.exp = 0;
  return { profile: p, levelsGained: gained };
}

/** Spend unspent stat points. Throws MetaError when amounts are not whole/positive or exceed the points. */
export function allocateStats(profile: Profile, add: Partial<Record<StatId, number>>): Profile {
  let total = 0;
  for (const id of STAT_IDS) {
    const n = add[id] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new MetaError('bad-amount', `allocateStats: ${id} must be a whole number ≥ 0`);
    total += n;
  }
  for (const k of Object.keys(add)) if (!(STAT_IDS as readonly string[]).includes(k)) throw new MetaError('bad-amount', `allocateStats: unknown stat "${k}"`);
  if (total > profile.unspentStatPoints) throw new MetaError('not-enough-points', `allocateStats: ${total} points asked, ${profile.unspentStatPoints} available`);
  if (total === 0) return profile;
  const p = structuredClone(profile);
  for (const id of STAT_IDS) p.stats[id] += add[id] ?? 0;
  p.unspentStatPoints -= total;
  return p;
}

export function canResetStatsFree(profile: Profile, content: ContentBundle): boolean {
  return profile.level <= content.meta.globalLevel.freeRespecUntilLevel;
}

/** Return every allocated stat point. Free up to `freeRespecUntilLevel`; otherwise throws (paid respec: P2-03). */
export function resetStats(profile: Profile, content: ContentBundle): Profile {
  if (!canResetStatsFree(profile, content)) throw new MetaError('respec-not-free', 'resetStats: free reset ends after Global Level ' + content.meta.globalLevel.freeRespecUntilLevel);
  const p = structuredClone(profile);
  let back = 0;
  for (const id of STAT_IDS) { back += p.stats[id]; p.stats[id] = 0; }
  p.unspentStatPoints += back;
  return p;
}

/** Stat-derived run modifiers: per-point values × allocated points, each clamped to ±statCaps[key]. */
export function statMods(profile: Profile, content: ContentBundle): Partial<Record<keyof Mods, number>> {
  const out: Record<string, number> = {};
  for (const id of STAT_IDS) {
    const pts = profile.stats[id];
    if (pts <= 0) continue;
    const per = content.meta.stats[id];
    for (const key of Object.keys(per).sort()) out[key] = (out[key] ?? 0) + per[key]! * pts;
  }
  for (const key of Object.keys(out)) {
    const cap = content.meta.statCaps[key];
    if (cap !== undefined) out[key] = Math.max(-cap, Math.min(cap, out[key]!));
    // Round away float noise (0.005 × 3 = 0.015000000000000001) so the loadout is stable data.
    out[key] = Math.round(out[key]! * 1e9) / 1e9;
  }
  return out as Partial<Record<keyof Mods, number>>;
}

export const statsContributor: LoadoutContributor = (profile, content) => ({ mods: statMods(profile, content) });
