import { content } from '@them/content';
import { seededRolls, type MetaEnv } from '../src/env';
import { newProfile, type Profile } from '../src/profile';

export function testEnv(seed = 1, start = 1_800_000_000_000): MetaEnv & { tick(ms: number): void } {
  let t = start;
  return { now: () => t, rolls: seededRolls(seed), tick: (ms) => { t += ms; } };
}

export function freshProfile(seed = 1): Profile {
  return newProfile(content, testEnv(seed));
}

/**
 * Content whose worlds have an unreachable recommended power, so the difficulty limiter never
 * scales the loadout. For tests that check a meta system's raw effect reaching core; the limiter
 * itself is tested in packages/core/test/power.test.ts and loadout-rewards.test.ts.
 */
export const unlimited: typeof content = { ...content, worlds: content.worlds.map((w) => ({ ...w, recommendedPower: 1e12 })) };
