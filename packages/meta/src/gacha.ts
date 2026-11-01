/**
 * Gacha (GDD §8, §12) — P2-08. Data: `content/data/gacha.json`. In-game currency only for now.
 *
 * Per pull (n = pulls since the last 5★, m = pulls since the last 4★ or better, both counting this one):
 *   p5 = 1                                   if n ≥ hard (80)
 *        base5 + softStep × (n − softFrom + 1) if n ≥ softFrom (60)
 *        base5 (1.5%)                       otherwise
 *   one uniform roll r: r < p5 → 5★; else if m ≥ guarantee4Every (10) → 4★; else the remaining
 *   stars by their base rates, renormalised. A 5★ resets both counters, a 4★ resets m.
 * Result: mean ≈ 41 pulls per 5★, 90% within 65 (GDD §12). Counters live in the profile, so pity
 * carries across banners. Rolls come only from the injected RollSource (server-side later).
 *
 * A new hero joins the roster (and the team if there is room); a duplicate becomes star shards.
 */
import type { ContentBundle } from '@them/content';
import type { RollSource } from './env';
import { MetaError } from './progression';
import type { Profile } from './profile';

export type Star = 1 | 2 | 3 | 4 | 5;

export interface PityState {
  pullsSince5: number;
  pullsSince4: number;
}

/** 5★ chance for the pull numbered `n` since the last 5★. */
export function fiveStarChance(content: ContentBundle, n: number): number {
  const g = content.gacha, base = g.rates['5'] ?? 0;
  if (n >= g.pity.hard) return 1;
  if (n >= g.pity.softFrom) return Math.min(1, base + g.pity.softStep * (n - g.pity.softFrom + 1));
  return base;
}

/** Roll one star and advance the pity state (mutates `state`). Pure apart from `rolls`. */
export function rollStar(content: ContentBundle, state: PityState, rolls: RollSource): Star {
  const g = content.gacha;
  const n = state.pullsSince5 + 1, m = state.pullsSince4 + 1;
  const p5 = fiveStarChance(content, n);
  const r = rolls.float();
  let star: Star;
  if (r < p5) star = 5;
  else if (m >= g.pity.guarantee4Every) star = 4;
  else {
    // Remaining stars by base rate, renormalised over (1 − p5): reuse r, uniform on [p5, 1).
    const rest: Star[] = [4, 3, 2, 1];
    const total = rest.reduce((a, s) => a + (g.rates[String(s) as '1'] ?? 0), 0);
    let x = ((r - p5) / (1 - p5)) * total;
    star = 1;
    for (const s of rest) {
      x -= g.rates[String(s) as '1'] ?? 0;
      if (x < 0) { star = s; break; }
    }
  }
  if (star === 5) { state.pullsSince5 = 0; state.pullsSince4 = 0; } else if (star === 4) { state.pullsSince5++; state.pullsSince4 = 0; } else { state.pullsSince5++; state.pullsSince4++; }
  return star;
}

/**
 * Long-run share of each star with pity and the 4★ guarantee included: the rates players really
 * get (owner decision 2026-11-01: the Summon screen shows these). Exact, from the stationary
 * distribution of the pity state (pullsSince5, pullsSince4); no simulation.
 */
export function effectiveRates(content: ContentBundle): Record<Star, number> {
  const g = content.gacha;
  const H = g.pity.hard, G4 = g.pity.guarantee4Every;
  const base = (s: Star) => g.rates[String(s) as '1'] ?? 0;
  const restTotal = base(4) + base(3) + base(2) + base(1);
  /** P(star | state) for state (a = pulls since 5★, b = pulls since 4★+). */
  const probs = (a: number, b: number): Record<Star, number> => {
    const p5 = fiveStarChance(content, a + 1);
    const rest = 1 - p5;
    if (b + 1 >= G4) return { 5: p5, 4: rest, 3: 0, 2: 0, 1: 0 };
    const k = restTotal > 0 ? rest / restTotal : 0;
    return { 5: p5, 4: base(4) * k, 3: base(3) * k, 2: base(2) * k, 1: base(1) * k };
  };
  const idx = (a: number, b: number) => a * G4 + b;
  let pi = new Float64Array(H * G4);
  pi[0] = 1;
  for (let it = 0; it < 5000; it++) {
    const next = new Float64Array(H * G4);
    for (let a = 0; a < H; a++) {
      for (let b = 0; b < G4; b++) {
        const w = pi[idx(a, b)]!;
        if (w === 0) continue;
        const p = probs(a, b);
        next[0] += w * p[5];
        if (a + 1 < H) {
          next[idx(a + 1, 0)] += w * p[4];
          if (b + 1 < G4) next[idx(a + 1, b + 1)] += w * (p[3] + p[2] + p[1]);
        }
      }
    }
    let diff = 0;
    for (let i = 0; i < next.length; i++) diff += Math.abs(next[i]! - pi[i]!);
    pi = next;
    if (diff < 1e-13) break;
  }
  const out: Record<Star, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (let a = 0; a < H; a++) {
    for (let b = 0; b < G4; b++) {
      const w = pi[idx(a, b)]!;
      if (w === 0) continue;
      const p = probs(a, b);
      for (const s of [5, 4, 3, 2, 1] as Star[]) out[s] += w * p[s];
    }
  }
  return out;
}

export interface PullResult {
  heroId: string;
  stars: Star;
  /** Already owned: converted to `shards` star shards. */
  duplicate: boolean;
  shards: number;
}

/** Give a hero: new → roster (+ team if there is room); owned → star shards. */
export function grantHero(profile: Profile, content: ContentBundle, heroId: string): { profile: Profile; duplicate: boolean; shards: number } {
  const def = content.heroes.find((h) => h.id === heroId);
  if (!def) throw new MetaError('unknown-hero', `grantHero: unknown hero "${heroId}"`);
  const p = structuredClone(profile);
  if (p.heroes.owned.some((h) => h.heroId === heroId)) {
    const shards = content.gacha.duplicateShards[String(def.stars) as '1'] ?? 0;
    const item = content.heroGrowth.shardItemId;
    p.items[item] = (p.items[item] ?? 0) + shards;
    return { profile: p, duplicate: true, shards };
  }
  p.heroes.owned.push({ heroId, stars: def.stars, level: 1, exp: 0, limitBreaks: 0 });
  if (p.heroes.team.length < content.meta.maxTeamSize) p.heroes.team.push(heroId);
  return { profile: p, duplicate: false, shards: 0 };
}

/** Pull 1 or 10 times on a banner, paying the in-game price. */
export function pull(
  profile: Profile, content: ContentBundle, bannerId: string, count: 1 | 10, rolls: RollSource,
): { profile: Profile; results: PullResult[] } {
  const g = content.gacha;
  const banner = g.banners.find((b) => b.id === bannerId);
  if (!banner) throw new MetaError('unknown-banner', `pull: unknown banner "${bannerId}"`);
  if (count !== 1 && count !== 10) throw new MetaError('bad-amount', 'pull: count must be 1 or 10');
  const price = count === 1 ? g.cost.single : g.cost.ten;
  const have = profile.currencies[g.cost.currency] ?? 0;
  if (have < price) throw new MetaError('not-enough-items', `pull: needs ${price} ${g.cost.currency}, have ${have}`);

  let p = structuredClone(profile);
  p.currencies[g.cost.currency] = have - price;
  const state: PityState = { pullsSince5: p.gacha.pullsSince5, pullsSince4: p.gacha.pullsSince4 };
  const results: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const star = rollStar(content, state, rolls);
    const pool = banner.pool[String(star) as '1'] ?? [];
    if (pool.length === 0) throw new MetaError('unknown-banner', `pull: banner "${bannerId}" has no ${star}★ hero`);
    const heroId = pool[rolls.int(pool.length)]!;
    const g2 = grantHero(p, content, heroId);
    p = g2.profile;
    results.push({ heroId, stars: star, duplicate: g2.duplicate, shards: g2.shards });
  }
  p.gacha = { pullsSince5: state.pullsSince5, pullsSince4: state.pullsSince4, totalPulls: p.gacha.totalPulls + count };
  return { profile: p, results };
}

export function checkGachaContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const g = content.gacha;
  const sum = (['1', '2', '3', '4', '5'] as const).reduce((a, k) => a + (g.rates[k] ?? 0), 0);
  if (Math.abs(sum - 1) > 1e-9) out.push(`gacha.rates: sum ${sum}, must be 1`);
  if (g.pity.softFrom >= g.pity.hard) out.push('gacha.pity: softFrom must be below hard');
  if (!content.meta.currencies.some((c) => c.id === g.cost.currency)) out.push(`gacha.cost.currency: unknown "${g.cost.currency}"`);
  for (const b of g.banners) {
    for (const k of ['1', '2', '3', '4', '5'] as const) {
      if ((g.rates[k] ?? 0) > 0 && !(b.pool[k]?.length)) out.push(`gacha.${b.id}: no ${k}★ hero but the rate is above 0`);
      for (const id of b.pool[k] ?? []) {
        const h = content.heroes.find((x) => x.id === id);
        if (!h) out.push(`gacha.${b.id}: unknown hero "${id}"`);
        else if (String(h.stars) !== k) out.push(`gacha.${b.id}: "${id}" is ${h.stars}★, listed under ${k}★`);
      }
    }
  }
  return out;
}
