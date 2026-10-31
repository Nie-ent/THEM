/**
 * Score and grade, exactly per GDD §12:
 *
 *   score = (killPoints + bossBonus) × M_difficulty × M_speed × M_damage
 *   M_speed  = clamp(standardTime / actualTime, 0.7, 1.3)
 *   M_damage = (0.7 + 0.3 × coreHpFrac) × (1.2 − 0.4 × heroDamageFrac)        ∈ [0.56, 1.2]
 *   grade by M_speed × M_damage: S ≥ 1.40, A ≥ 1.15, B ≥ 0.90, else C
 *
 * All constants come from `balance.scoring` in content. Pure functions, unit-tested.
 */
import type { BalanceDef, Grade } from '@them/content';
import type { Difficulty, ScoreBreakdown } from './types';

type Scoring = BalanceDef['scoring'];

export interface ScoreInput {
  kills: { normal: number; elite: number; miniboss: number; boss: number };
  bossKilled: boolean;
  difficulty: Difficulty;
  hardcoreRules: number;
  standardTime: number;
  actualTime: number;
  coreHpFrac: number;
  /** Fraction of damage the hero took, 0..1 (mean per-wave damage taken / max HP). */
  heroDamageFrac: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function difficultyMultiplier(s: Scoring, difficulty: Difficulty, hardcoreRules: number): number {
  return clamp(s.difficulty[difficulty] + s.difficulty.hardcoreRuleBonus * hardcoreRules, 0, s.difficulty.max);
}

export function speedMultiplier(s: Scoring, standardTime: number, actualTime: number): number {
  if (actualTime <= 0) return s.speed.max;
  return clamp(standardTime / actualTime, s.speed.min, s.speed.max);
}

export function damageMultiplier(s: Scoring, coreHpFrac: number, heroDamageFrac: number): number {
  const d = s.damage;
  return (d.coreBase + d.coreWeight * clamp(coreHpFrac, 0, 1)) * (d.heroBase - d.heroWeight * clamp(heroDamageFrac, 0, 1));
}

export function gradeFor(s: Scoring, performance: number): { grade: Grade; rewardPct: number } {
  const bands = [...s.grades].sort((a, b) => b.min - a.min);
  for (const b of bands) if (performance >= b.min) return { grade: b.grade, rewardPct: b.rewardPct };
  const last = bands[bands.length - 1]!;
  return { grade: last.grade, rewardPct: last.rewardPct };
}

export function computeScore(s: Scoring, i: ScoreInput): ScoreBreakdown {
  const kp = s.killPoints;
  const killPoints = i.kills.normal * kp.normal + i.kills.elite * kp.elite + i.kills.miniboss * kp.miniboss + i.kills.boss * kp.boss;
  const bossBonus = i.bossKilled ? s.bossBonus : 0;
  const mDifficulty = difficultyMultiplier(s, i.difficulty, i.hardcoreRules);
  const mSpeed = speedMultiplier(s, i.standardTime, i.actualTime);
  const mDamage = damageMultiplier(s, i.coreHpFrac, i.heroDamageFrac);
  const performance = mSpeed * mDamage;
  const { grade, rewardPct } = gradeFor(s, performance);
  return {
    kills: { ...i.kills },
    killPoints,
    bossBonus,
    mDifficulty,
    mSpeed,
    mDamage,
    performance,
    total: Math.round((killPoints + bossBonus) * mDifficulty * mSpeed * mDamage),
    grade,
    rewardPct,
  };
}

/**
 * Difficulty limiter (GDD §3 "จำกัดผลของการฟาร์ม"). Returns the damage multiplier for the player's
 * side. Below recommended power it scales linearly (you are weaker). Above it, the excess gives
 * diminishing returns that approach `cap` asymptotically:
 *
 *   excess = power / recommended − 1
 *   bonus  = cap × excess / (excess + cap)      (slope 1 at 0, never exceeds cap)
 *
 * e.g. cap 0.10: +10% power → +5%, +50% → +8.3%, ×10 power → +9.9%. Rational function on purpose:
 * Math.exp is not guaranteed bit-identical across JS engines.
 */
export function powerMultiplier(power: number, recommended: number, cap: number): number {
  if (recommended <= 0) return 1;
  const ratio = power / recommended;
  if (ratio <= 1) return Math.max(0.25, ratio);
  const excess = ratio - 1;
  if (cap <= 0) return 1;
  return 1 + (cap * excess) / (excess + cap);
}
