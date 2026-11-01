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
