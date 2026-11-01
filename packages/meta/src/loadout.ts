/**
 * Profile → loadout → `createRun` config.
 *
 * Each meta system contributes modifiers through a `LoadoutContributor`. P2-01 ships none, so a
 * new profile plays exactly like Phase 1. Later tickets add theirs to `CONTRIBUTORS` (P2-02 stats,
 * P2-03 traits, P2-04 class, P2-05 titles, P2-06 gear, P2-07 heroes).
 *
 * Stacking: within the loadout every contribution to the same key is **summed** (so two +10%
 * damage sources make +20%, applied once by core as ×1.2). Power contributions are summed too.
 */
import type { ContentBundle } from '@them/content';
import type { Difficulty, Loadout, Mods, RunConfig } from '@them/core';
import type { Profile } from './profile';

export interface LoadoutPart {
  /** Same convention as core `Loadout.mods`: `*Mult` keys are fractions, others are added. */
  mods?: Partial<Record<keyof Mods, number>>;
  /** Player power for the difficulty limiter (GDD §3). */
  power?: number;
}

export type LoadoutContributor = (profile: Profile, content: ContentBundle) => LoadoutPart;

/** Registered contributors, in a fixed order. Phase 2 tickets append here. */
export const CONTRIBUTORS: readonly LoadoutContributor[] = [];

export interface BuiltLoadout {
  loadout: Loadout;
  /** Undefined when no contributor sets power: core then uses the world's recommended power. */
  power: number | undefined;
}

export function buildLoadout(profile: Profile, content: ContentBundle, contributors: readonly LoadoutContributor[] = CONTRIBUTORS): BuiltLoadout {
  const mods: Partial<Record<keyof Mods, number>> = {};
  let power: number | undefined;
  for (const c of contributors) {
    const part = c(profile, content);
    for (const [k, v] of Object.entries(part.mods ?? {}) as [keyof Mods, number][]) {
      mods[k] = (mods[k] ?? 0) + v;
    }
    if (part.power !== undefined) power = (power ?? 0) + part.power;
  }
  return { loadout: { mods }, power };
}

/** The ally heroes a profile brings: its team, owned and known to content, capped at maxTeamSize. */
export function teamFor(profile: Profile, content: ContentBundle): string[] {
  const owned = new Set(profile.heroes.owned.map((h) => h.heroId));
  const known = new Set(content.heroes.map((h) => h.id));
  const out: string[] = [];
  for (const id of profile.heroes.team) {
    if (out.length >= content.meta.maxTeamSize) break;
    if (owned.has(id) && known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export interface RunRequest {
  worldId: string;
  difficulty?: Difficulty;
  hardcoreRules?: number;
}

/** Everything `createRun` needs from the profile. */
export function buildRunConfig(
  profile: Profile,
  content: ContentBundle,
  req: RunRequest,
  contributors: readonly LoadoutContributor[] = CONTRIBUTORS,
): RunConfig {
  if (!content.worlds.some((w) => w.id === req.worldId)) throw new Error(`buildRunConfig: unknown world "${req.worldId}"`);
  const { loadout, power } = buildLoadout(profile, content, contributors);
  const config: RunConfig = { worldId: req.worldId, allyHeroes: teamFor(profile, content), loadout };
  if (req.difficulty !== undefined) config.difficulty = req.difficulty;
  if (req.hardcoreRules !== undefined) config.hardcoreRules = req.hardcoreRules;
  if (power !== undefined) config.power = power;
  return config;
}
