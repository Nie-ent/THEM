/**
 * Everything non-deterministic that meta needs is injected, so meta stays pure (no Date, no
 * Math.random) and the same code can run on the server in Phase 4.
 *
 * - `now()`: wall clock in ms (the app passes `Date.now`; tests pass a fixed clock).
 * - `rolls`: the single source of randomness for profile ids, gacha and enhancement rolls. Locally
 *   it is seeded from the app; server-side it will be the server's RNG.
 */
import { Rng } from '@them/core';

/** Random source for meta rolls. `@them/core`'s `Rng` satisfies it. */
export interface RollSource {
  /** Uniform float in [0, 1). */
  float(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

export interface MetaEnv {
  now(): number;
  rolls: RollSource;
}

/** Deterministic roll source (sfc32). The app seeds it from `crypto.getRandomValues`. */
export function seededRolls(seed: number): RollSource {
  return new Rng(seed >>> 0);
}

/** 32 hex chars from the roll source. */
export function rollId(rolls: RollSource): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += rolls.int(0x10000).toString(16).padStart(4, '0');
  return s;
}
