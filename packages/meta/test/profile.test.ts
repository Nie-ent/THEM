import { describe, expect, it } from 'vitest';
import { content, loadContent, raw } from '@them/content';
import { checkMetaContent, newProfile, Profile, betterGrade } from '../src/profile';
import { freshProfile, testEnv } from './helpers';

describe('profile model', () => {
  it('shipped content passes the meta cross-checks', () => {
    expect(checkMetaContent(content)).toEqual([]);
  });

  it('cross-checks catch bad starting data and unknown reward currencies', () => {
    const bad = structuredClone(raw) as Record<string, unknown> & {
      meta: { startingProfile: { heroes: string[]; team: string[] } };
      worlds: { rewards?: Record<string, number> }[];
    };
    bad.meta.startingProfile.heroes = ['brann', 'ghost'];
    bad.meta.startingProfile.team = ['mira'];
    bad.worlds[0]!.rewards = { gems: 5 };
    const problems = checkMetaContent(loadContent(bad));
    expect(problems).toContain('meta.startingProfile.heroes: unknown hero "ghost"');
    expect(problems).toContain('meta.startingProfile.team: hero "mira" is not owned');
    expect(problems.some((p) => p.includes('unknown currency "gems"'))).toBe(true);
  });

  it('a new profile is valid and built from content.meta.startingProfile', () => {
    const p = freshProfile();
    expect(Profile.parse(p)).toEqual(p);
    expect(p.level).toBe(1);
    expect(p.exp).toBe(0);
    expect(p.currencies).toEqual({ gold: 0 });
    expect(p.heroes.team).toEqual(content.meta.startingProfile.team);
    for (const h of p.heroes.owned) {
      expect(h.stars).toBe(content.heroes.find((d) => d.id === h.heroId)!.stars);
    }
    expect(p.createdAt).toBe(1_800_000_000_000);
    expect(p.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('profile ids come from the injected roll source (deterministic per seed)', () => {
    expect(newProfile(content, testEnv(9)).id).toBe(newProfile(content, testEnv(9)).id);
    expect(newProfile(content, testEnv(9)).id).not.toBe(newProfile(content, testEnv(10)).id);
  });

  it('the schema rejects negative currencies and out-of-range stars', () => {
    const p = freshProfile();
    expect(Profile.safeParse({ ...p, currencies: { gold: -1 } }).success).toBe(false);
    expect(Profile.safeParse({ ...p, heroes: { ...p.heroes, owned: [{ heroId: 'mira', stars: 6, level: 1, exp: 0 }] } }).success).toBe(false);
  });

  it('betterGrade picks the higher band', () => {
    expect(betterGrade(null, 'B')).toBe('B');
    expect(betterGrade('A', 'S')).toBe('S');
    expect(betterGrade('A', 'C')).toBe('A');
  });
});
