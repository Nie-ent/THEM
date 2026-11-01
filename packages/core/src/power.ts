/**
 * Player power and the difficulty limiter (GDD §3 "จำกัดผลของการฟาร์ม"), the one place both live.
 *
 * POWER is a single number computed from the run loadout (what meta progression brings in) and the
 * AI team. A bare loadout with the default team is exactly BASE_POWER (100). It is a combat rating:
 *
 *   m        = baseMods with the loadout applied (same convention as core: *Mult keys ×(1+v))
 *   offense  = damageMult / cooldownMult × (1 + crit × (critMult − 1)) × projectiles × (1 + 0.5 × (rangeMult − 1))
 *   defense  = maxHpMult × (1 + regen × 20 s / base HP) × (1 − baseArmor) / (1 − armor) / damageTakenMult
 *              × (1 + 0.5 × (speedMult − 1))
 *   hero     = √(offense × defense)
 *   team     = Σ over the run's AI heroes of base_i × √((1 + hpMult_i)(1 + damageMult_i))
 *              ÷ Σ over the content default team of base_j        (base = √(HP × weapon DPS))
 *              × √(heroes in the run ÷ heroes in the default team)
 *              → 1 for the default pair at level 1. Higher-star or levelled heroes raise it; so does
 *              headcount (more bodies cover more lanes and soak aggro; measured: 4 weak heroes beat 2
 *              heroes of the same total strength, so headcount counts beyond raw strength)
 *   support  = (team × √allyDamageMult + structureDamageMult) / 2
 *   power    = 100 × √(hero × support)
 *
 * Only `Math.sqrt` and + − × ÷ (correctly rounded by IEEE 754), so it is bit-identical everywhere.
 * Card param deltas (traits that modify cards) are not counted but are scaled with the loadout.
 * Draft weights and unlocked class cards are choices: neither counted nor scaled.
 *
 * LIMITER: each world has `recommendedPower`. At or below it the loadout applies unchanged (no
 * penalty). Above it, the *loadout itself* is scaled down by one factor s ∈ [0, 1], chosen by
 * bisection so the scaled loadout's power equals
 *
 *   target = recommended × powerMultiplier(power, recommended, cap)      (< recommended × (1 + cap))
 *
 * Every loadout modifier and card param delta is multiplied by s. The AI team's strength above the default team becomes
 * 1 + (team − 1) × s, applied as one factor (`allyFactor`) on every AI hero's HP and damage. So the
 * limiter acts on the loadout's aggregate effect and never stacks on top of it (`run.powerMult`
 * stays 1 whenever power comes from the loadout).
 */
import { baseMods, type Loadout, type Mods } from './types';
import { powerMultiplier } from './scoring';

export const BASE_POWER = 100;
/** Seconds of regeneration counted as extra effective HP. */
const REGEN_WINDOW = 20;

export interface PowerBase {
  heroHp: number;
  heroArmor: number;
  /** AI heroes in the run, with their content base strength (`heroBaseStrength`). */
  allies: readonly { id: string; base: number }[];
  /** Σ base strength of the content default team: the team's 1.0. */
  referenceTeam: number;
  /** Number of heroes in the content default team. */
  referenceCount: number;
}

/** Content base strength of an AI hero: √(HP × weapon DPS). */
export function heroBaseStrength(hp: number, w: { damage: number; cooldown: number; count: number }): number {
  return Math.sqrt(hp * ((w.damage * w.count) / Math.max(0.05, w.cooldown)));
}

export function loadoutMods(lo: Loadout | undefined, scale = 1): Mods {
  const m = baseMods();
  const lm = lo?.mods;
  if (!lm) return m;
  for (const key of Object.keys(lm).sort()) {
    const k = key as keyof Mods;
    const v = (lm[k] ?? 0) * scale;
    if (key.endsWith('Mult')) m[k] *= 1 + v;
    else m[k] += v;
  }
  return m;
}

/** AI team strength relative to the default team, with full growth. */
export function teamStrength(lo: Loadout | undefined, base: PowerBase): number {
  if (base.referenceTeam <= 0) return 0;
  let sum = 0;
  for (const a of base.allies) {
    const g = lo?.allyMods?.[a.id];
    sum += a.base * Math.sqrt((1 + (g?.hpMult ?? 0)) * (1 + (g?.damageMult ?? 0)));
  }
  const n = base.allies.length, ref = Math.max(1, base.referenceCount);
  return (sum / base.referenceTeam) * Math.sqrt(n / ref);
}

/** Team strength at loadout scale s: only the part above the default team is scaled (no penalty below). */
function scaledTeam(full: number, s: number): number {
  return full > 1 ? 1 + (full - 1) * s : full;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Power of `lo` with every loadout effect multiplied by `scale` (1 = as given). */
export function loadoutPower(lo: Loadout | undefined, base: PowerBase, scale = 1): number {
  const m = loadoutMods(lo, scale);
  const crit = clamp(m.critChance, 0, 1);
  const offense =
    (Math.max(0, m.damageMult) / Math.max(0.05, m.cooldownMult)) *
    (1 + crit * Math.max(0, m.critMult - 1)) *
    Math.max(1, 1 + m.projectileCountAdd) *
    Math.max(0.1, 1 + 0.5 * (m.rangeMult - 1));
  const armor = clamp(base.heroArmor + m.armorAdd, 0, 0.9);
  const defense =
    Math.max(0.01, m.maxHpMult) *
    (1 + (Math.max(0, m.regenPerSec) * REGEN_WINDOW) / Math.max(1, base.heroHp)) *
    ((1 - clamp(base.heroArmor, 0, 0.9)) / (1 - armor)) /
    Math.max(0.05, m.damageTakenMult) *
    Math.max(0.1, 1 + 0.5 * (m.speedMult - 1));
  const hero = Math.sqrt(offense * defense);
  const team = scaledTeam(teamStrength(lo, base), scale);
  const support = (team * Math.sqrt(Math.max(0, m.allyDamageMult)) + Math.max(0, m.structureDamageMult)) / 2;
  return BASE_POWER * Math.sqrt(hero * support);
}

export interface LimiterResult {
  /** Loadout power before the limiter. */
  power: number;
  recommended: number;
  /** Power after the limiter (= power when inactive). */
  effectivePower: number;
  /** Factor applied to every loadout modifier (1 = unchanged). */
  scale: number;
  /** Factor on every AI hero's HP and damage, on top of full growth (1 = unchanged). */
  allyFactor: number;
  active: boolean;
}

/** Choose the loadout scale for a world. Deterministic: fixed-iteration bisection, sqrt only. */
export function limitLoadout(lo: Loadout | undefined, base: PowerBase, recommended: number, cap: number): LimiterResult {
  const power = loadoutPower(lo, base, 1);
  if (!(power > recommended) || recommended <= 0) {
    return { power, recommended, effectivePower: power, scale: 1, allyFactor: 1, active: false };
  }
  const target = recommended * powerMultiplier(power, recommended, cap);
  let lo_ = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo_ + hi) / 2;
    if (loadoutPower(lo, base, mid) > target) hi = mid; else lo_ = mid;
  }
  const full = teamStrength(lo, base);
  const allyFactor = full > 1 ? scaledTeam(full, lo_) / full : 1;
  return { power, recommended, effectivePower: loadoutPower(lo, base, lo_), scale: lo_, allyFactor, active: true };
}
