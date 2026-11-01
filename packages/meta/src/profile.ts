/**
 * The player profile: everything that persists between runs (GDD §4–§8). This is the **current**
 * save schema (version `SAVE_VERSION`). Any change to its shape needs a migration in
 * `migrations.ts` and a bump of `SAVE_VERSION` — see that file.
 *
 * Profiles are treated as immutable values: functions return a new profile, never mutate.
 * Phase 2 tickets fill in the rules (P2-02 levels/stats, P2-03 traits, P2-04 class, P2-05 titles,
 * P2-06 gear, P2-07 heroes, P2-08 gacha); P2-01 fixes the shape so saves are stable from day one.
 */
import type { ContentBundle, Grade } from '@them/content';
import { createRun } from '@them/core';
import { z } from 'zod';
import { rollId, type MetaEnv } from './env';

const Count = z.number().int().nonnegative();

/** GDD §4 stats: พลังกาย, ปัญญา, ความว่องไว, ความอึด, การบัญชาการ. */
export const STAT_IDS = ['strength', 'intellect', 'agility', 'vitality', 'command'] as const;
export type StatId = (typeof STAT_IDS)[number];

export const GearItem = z.object({
  /** Unique per profile (rolled). */
  uid: z.string().min(1),
  /** Content item id. */
  itemId: z.string().min(1),
  /** Enhancement level +0..+15 (GDD §12). */
  enhance: z.number().int().min(0).max(15),
});
export type GearItem = z.infer<typeof GearItem>;

export const HeroInstance = z.object({
  heroId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  level: z.number().int().min(1),
  exp: Count,
});
export type HeroInstance = z.infer<typeof HeroInstance>;

export const GradeSchema = z.enum(['S', 'A', 'B', 'C']);

export const WorldProgress = z.object({
  /** Won at least once on any difficulty. */
  cleared: z.boolean(),
  runs: Count,
  wins: Count,
  bestScore: Count,
  /** Best grade of a won run (a loss is always the lowest band and never counts here). */
  bestGrade: GradeSchema.nullable(),
});
export type WorldProgress = z.infer<typeof WorldProgress>;

/** How many recent run ids are remembered so a run's rewards are never applied twice. */
export const REWARDED_RUNS_KEPT = 32;

export const Profile = z.object({
  id: z.string().min(1),
  /** ms since epoch, from the injected clock. */
  createdAt: Count,
  updatedAt: Count,

  /** Global Level (cap from content, P2-02) and EXP into the current level. */
  level: z.number().int().min(1),
  exp: Count,

  /** Allocated stat points per stat (GDD §4). */
  stats: z.object({ strength: Count, intellect: Count, agility: Count, vitality: Count, command: Count }),
  unspentStatPoints: Count,

  /** Trait Tree (GDD §5): points per node id. */
  traits: z.object({ nodes: z.record(z.string(), Count), unspentPoints: Count, respecs: Count }),

  /** Class id (GDD §6), null before the first class pick at Lv 10. */
  classId: z.string().nullable(),

  /** Equipment (GDD §4, §12 enhancement). `equipped` maps slot → item uid. */
  gear: z.object({ items: z.array(GearItem), equipped: z.record(z.string(), z.string()) }),

  /** AI heroes (GDD §8). `team` = hero ids brought into runs, all owned. */
  heroes: z.object({ owned: z.array(HeroInstance), team: z.array(z.string()) }),

  /** Titles (GDD §7). */
  titles: z.object({ unlocked: z.array(z.string()), equipped: z.string().nullable() }),

  /** Currency id → amount (ids from content `meta.currencies`). */
  currencies: z.record(z.string(), Count),
  /** Stackable items: EXP books, star shards, protection scrolls … (id → count). */
  items: z.record(z.string(), Count),

  /** Gacha pity counters (GDD §12), carried across banners. */
  gacha: z.object({ pullsSince5: Count, pullsSince4: Count, totalPulls: Count }),

  /** Per world id. */
  worlds: z.record(z.string(), WorldProgress),
  totals: z.object({ runs: Count, wins: Count }),

  /** Ids of the most recent rewarded runs (newest last, at most REWARDED_RUNS_KEPT). */
  rewardedRuns: z.array(z.string()).max(REWARDED_RUNS_KEPT),
});
export type Profile = z.infer<typeof Profile>;

/** A fresh profile from content `meta.startingProfile`. */
export function newProfile(content: ContentBundle, env: MetaEnv): Profile {
  const start = content.meta.startingProfile;
  const t = env.now();
  const currencies: Record<string, number> = {};
  for (const c of content.meta.currencies) currencies[c.id] = start.currencies[c.id] ?? 0;
  const owned: HeroInstance[] = start.heroes.map((heroId) => {
    const def = content.heroes.find((h) => h.id === heroId);
    if (!def) throw new Error(`newProfile: unknown starting hero "${heroId}"`);
    return { heroId, stars: def.stars, level: 1, exp: 0 };
  });
  return {
    id: rollId(env.rolls),
    createdAt: t,
    updatedAt: t,
    level: 1,
    exp: 0,
    stats: { strength: 0, intellect: 0, agility: 0, vitality: 0, command: 0 },
    unspentStatPoints: 0,
    traits: { nodes: {}, unspentPoints: 0, respecs: 0 },
    classId: null,
    gear: { items: [], equipped: {} },
    heroes: { owned, team: [...start.team] },
    titles: { unlocked: [], equipped: null },
    currencies,
    items: {},
    gacha: { pullsSince5: 0, pullsSince4: 0, totalPulls: 0 },
    worlds: {},
    totals: { runs: 0, wins: 0 },
    rewardedRuns: [],
  };
}

/** Grade order, best first. */
const GRADE_RANK: Record<Grade, number> = { S: 0, A: 1, B: 2, C: 3 };
export function betterGrade(a: Grade | null, b: Grade | null): Grade | null {
  if (a === null) return b;
  if (b === null) return a;
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b;
}

/**
 * Cross-checks content `meta` against the rest of the bundle. Returns problems (empty = ok).
 * Covered by a test so a data edit cannot ship a broken starting profile.
 */
export function checkMetaContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const m = content.meta;
  const currencyIds = new Set(m.currencies.map((c) => c.id));
  const heroIds = new Set(content.heroes.map((h) => h.id));
  if (currencyIds.size !== m.currencies.length) out.push('meta.currencies: duplicate id');
  for (const id of Object.keys(m.startingProfile.currencies)) {
    if (!currencyIds.has(id)) out.push(`meta.startingProfile.currencies: unknown currency "${id}"`);
  }
  for (const id of m.startingProfile.heroes) if (!heroIds.has(id)) out.push(`meta.startingProfile.heroes: unknown hero "${id}"`);
  if (new Set(m.startingProfile.heroes).size !== m.startingProfile.heroes.length) out.push('meta.startingProfile.heroes: duplicate hero');
  for (const id of m.startingProfile.team) {
    if (!m.startingProfile.heroes.includes(id)) out.push(`meta.startingProfile.team: hero "${id}" is not owned`);
  }
  if (m.startingProfile.team.length > m.maxTeamSize) out.push('meta.startingProfile.team: larger than maxTeamSize');
  for (const w of content.worlds) {
    for (const id of Object.keys(w.rewards)) {
      if (!currencyIds.has(id)) out.push(`worlds.${w.id}.rewards: unknown currency "${id}"`);
    }
  }
  const g = m.globalLevel;
  if (g.expToNext.length !== g.cap - 1) out.push(`meta.globalLevel.expToNext: ${g.expToNext.length} entries, cap ${g.cap} needs ${g.cap - 1}`);
  for (const k of Object.keys(m.statCaps)) if (!(m.statCaps[k]! >= 0)) out.push(`meta.statCaps.${k}: must be ≥ 0`);
  // Stat mod keys must be core Mods keys: createRun rejects unknown loadout keys (cheap, one run).
  const keys = new Set<string>();
  for (const id of STAT_IDS) for (const k of Object.keys(m.stats[id])) keys.add(k);
  try {
    createRun({ worldId: content.worlds[0]!.id, loadout: { mods: Object.fromEntries([...keys].map((k) => [k, 0])) } }, content, 1);
  } catch (e) {
    out.push(`meta.stats: ${(e as Error).message}`);
  }
  return out;
}
