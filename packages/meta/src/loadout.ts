/**
 * Profile → loadout → `createRun` config.
 *
 * Each meta system contributes modifiers through a `LoadoutContributor`. A new profile (no stats,
 * no traits …) contributes nothing, so it plays exactly like Phase 1. Tickets add theirs to
 * `CONTRIBUTORS`: P2-02 stats (done), P2-03 traits (done), P2-04 class (done), P2-05 titles (done), P2-06 gear (done), P2-07 heroes (done).
 *
 * Player power is not a meta number: core derives it from this loadout (packages/core/src/power.ts)
 * and applies the world's difficulty limiter by scaling the loadout above recommended power
 * (GDD §3). Meta never sets `RunConfig.power`, so growth is counted exactly once.
 *
 * Stacking: within the loadout every contribution to the same key is **summed** (so two +10%
 * damage sources make +20%, applied once by core as ×1.2).
 */
import type { ContentBundle } from '@them/content';
import type { Difficulty, Loadout, Mods, RunConfig } from '@them/core';
import type { Profile } from './profile';
import { statsContributor } from './progression';
import { traitsContributor } from './traits';
import { classContributor } from './classes';
import { titlesContributor } from './titles';
import { gearContributor } from './gear';
import { heroesContributor } from './heroes';
import { teamFor } from './team';

export { teamFor };

export interface LoadoutPart {
  /** Same convention as core `Loadout.mods`: `*Mult` keys are fractions, others are added. */
  mods?: Partial<Record<keyof Mods, number>>;
  /** Card param deltas (summed per card and param). */
  cardParams?: Record<string, Record<string, number>>;
  /** Card draft weight multipliers (multiplied together). */
  cardWeights?: Record<string, number>;
  /** Bring no AI heroes (any contributor setting it wins). */
  noAllies?: boolean;
  /** Exclusive (class) cards the draft may offer (union). */
  unlockCards?: string[];
  /** Per-hero growth (summed per hero and key). */
  allyMods?: Record<string, { hpMult?: number; damageMult?: number }>;
}

/** `ranked`: ranked mode (GDD §7: title bonuses off; later, a normalised loadout). */
export interface LoadoutContext { ranked: boolean }

export type LoadoutContributor = (profile: Profile, content: ContentBundle, ctx?: LoadoutContext) => LoadoutPart;

/** Registered contributors, in a fixed order. Phase 2 tickets append here. */
export const CONTRIBUTORS: readonly LoadoutContributor[] = [
  statsContributor, // P2-02
  traitsContributor, // P2-03
  classContributor, // P2-04
  titlesContributor, // P2-05
  gearContributor, // P2-06
  heroesContributor, // P2-07
];

export interface BuiltLoadout {
  loadout: Loadout;
  noAllies: boolean;
}

export function buildLoadout(
  profile: Profile,
  content: ContentBundle,
  contributors: readonly LoadoutContributor[] = CONTRIBUTORS,
  ctx: LoadoutContext = { ranked: false },
): BuiltLoadout {
  const mods: Partial<Record<keyof Mods, number>> = {};
  const cardParams: Record<string, Record<string, number>> = {};
  const cardWeights: Record<string, number> = {};
  let noAllies = false;
  const unlock = new Set<string>();
  const allyMods: Record<string, { hpMult?: number; damageMult?: number }> = {};
  for (const c of contributors) {
    const part = c(profile, content, ctx);
    for (const [k, v] of Object.entries(part.mods ?? {}) as [keyof Mods, number][]) {
      mods[k] = (mods[k] ?? 0) + v;
    }
    for (const [card, params] of Object.entries(part.cardParams ?? {})) {
      const t = (cardParams[card] ??= {});
      for (const [k, v] of Object.entries(params)) t[k] = (t[k] ?? 0) + v;
    }
    for (const [card, m] of Object.entries(part.cardWeights ?? {})) cardWeights[card] = (cardWeights[card] ?? 1) * m;
    if (part.noAllies) noAllies = true;
    for (const id of part.unlockCards ?? []) unlock.add(id);
    for (const [hero, m] of Object.entries(part.allyMods ?? {})) {
      const t = (allyMods[hero] ??= {});
      if (m.hpMult !== undefined) t.hpMult = (t.hpMult ?? 0) + m.hpMult;
      if (m.damageMult !== undefined) t.damageMult = (t.damageMult ?? 0) + m.damageMult;
    }
  }
  // Only include card changes when there are some, so an empty profile gives the bare `{ mods }`.
  const loadout: Loadout = { mods };
  if (Object.keys(cardParams).length > 0) loadout.cardParams = cardParams;
  if (Object.keys(cardWeights).length > 0) loadout.cardWeights = cardWeights;
  if (unlock.size > 0) loadout.unlockCards = [...unlock].sort();
  if (Object.keys(allyMods).length > 0) loadout.allyMods = allyMods;
  return { loadout, noAllies };
}

export interface RunRequest {
  worldId: string;
  difficulty?: Difficulty;
  hardcoreRules?: number;
  /** Ranked run: title bonuses off (GDD §7). */
  ranked?: boolean;
}

/** Everything `createRun` needs from the profile. */
export function buildRunConfig(
  profile: Profile,
  content: ContentBundle,
  req: RunRequest,
  contributors: readonly LoadoutContributor[] = CONTRIBUTORS,
): RunConfig {
  if (!content.worlds.some((w) => w.id === req.worldId)) throw new Error(`buildRunConfig: unknown world "${req.worldId}"`);
  const { loadout, noAllies } = buildLoadout(profile, content, contributors, { ranked: req.ranked ?? false });
  const config: RunConfig = { worldId: req.worldId, allyHeroes: noAllies ? [] : teamFor(profile, content), loadout };
  if (req.difficulty !== undefined) config.difficulty = req.difficulty;
  if (req.hardcoreRules !== undefined) config.hardcoreRules = req.hardcoreRules;
  return config;
}
