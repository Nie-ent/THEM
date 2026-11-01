/**
 * Run result → profile (GDD §3, §12).
 *
 *   currency = floor(world.rewards[c] × rewardPct / 100 × lossFactor)
 *   item     = stochasticRound(world.rewardItems[i] × rewardPct / 100 × lossFactor), at least 1 on a win
 *   lossFactor = wavesCleared / waveCount on a loss when content `meta.runRewards.lossScalesByWavesCleared`,
 *                else 1
 *
 * `rewardPct` comes from the run's grade (S 120, A 100, B 80, C 60); a loss is always the lowest band
 * (core caps it). Account EXP uses the same factor: floor((runExp.base + runExp.perLevel × L) × factor),
 * L = the profile's Global Level when the run is recorded (P2-02).
 *
 * Items are small counts (1–3), so flooring erased grade differences (QA-P2-003). They round
 * stochastically instead: the fractional part is paid as one extra item with that probability, so
 * the expected value is exact (S pays 20% more on average, a wave-11 loss still averages 0.9
 * stones). The "roll" is a hash of (runId, item id): deterministic, so the results-screen preview and
 * the applied reward always agree and a retried save pays the same. Any win pays at least 1 of
 * every item the world awards (every win progresses hero limit breaks).
 *
 * Each outcome carries a `runId`; rewards for the same id are applied once (the profile remembers
 * the last REWARDED_RUNS_KEPT ids), so a retried save or a double event cannot pay twice.
 */
import type { ContentBundle, Grade } from '@them/content';
import { score as scoreOf, view, type Difficulty, type Run, type ScoreBreakdown } from '@them/core';
import { REWARDED_RUNS_KEPT, betterGrade, type Profile, type WorldProgress } from './profile';
import { grantExp, runExpFor } from './progression';
import { unlockTitles } from './titles';

export interface RunOutcome {
  runId: string;
  worldId: string;
  difficulty: Difficulty;
  result: 'win' | 'lose';
  score: ScoreBreakdown;
  wavesCleared: number;
  waveCount: number;
  /** Run facts for achievements (titles). Absent = run conditions that need them do not match. */
  facts?: RunFacts;
}

export interface RunFacts {
  /** Mean fraction of hero max HP lost per wave (the score's hero-damage input), 0..1. */
  heroDamageFrac: number;
  /** Core HP left at the end, 0..1. */
  coreHpFrac: number;
  /** AI heroes brought into the run. */
  allies: number;
}

/** Reads the outcome of an ended run. Throws if the run has not ended. */
export function outcomeFromRun(run: Run, runId: string): RunOutcome {
  const v = view(run);
  if (v.phase !== 'ended' || v.result === null) throw new Error('outcomeFromRun: run has not ended');
  return {
    runId,
    worldId: run.config.worldId,
    difficulty: run.config.difficulty,
    result: v.result,
    score: scoreOf(run),
    // waveIndex is the 0-based wave in progress (or about to start in prep) = waves fully cleared.
    wavesCleared: v.result === 'win' ? v.waveCount : run.waveIndex,
    waveCount: v.waveCount,
    facts: {
      heroDamageFrac: run.wavesScored > 0 ? run.heroDamageFracSum / run.wavesScored : 0,
      coreHpFrac: Math.max(0, run.w.hp[run.core]!) / run.w.maxHp[run.core]!,
      allies: run.allies.length,
    },
  };
}

export interface RunRewards {
  /** Effective fraction paid, after grade and loss scaling (e.g. 0.6 × 7/20). */
  factor: number;
  grade: Grade;
  currencies: Record<string, number>;
  /** Items (e.g. enhancement stones, P2-06), scaled like currencies. */
  items: Record<string, number>;
  /** Account EXP (P2-02). */
  exp: number;
}

/** `level` = the profile's Global Level (drives account EXP). */
export function computeRunRewards(outcome: RunOutcome, content: ContentBundle, level = 1): RunRewards {
  const world = content.worlds.find((w) => w.id === outcome.worldId);
  if (!world) throw new Error(`computeRunRewards: unknown world "${outcome.worldId}"`);
  let factor = outcome.score.rewardPct / 100;
  if (outcome.result === 'lose' && content.meta.runRewards.lossScalesByWavesCleared) {
    const n = Math.max(1, outcome.waveCount);
    factor *= Math.min(n, Math.max(0, outcome.wavesCleared)) / n;
  }
  const currencies: Record<string, number> = {};
  for (const id of Object.keys(world.rewards).sort()) {
    // Round the factor product to 1e-9 first so 100 × 0.6 does not floor to 59 on float error.
    currencies[id] = Math.floor(Math.round(world.rewards[id]! * factor * 1e9) / 1e9);
  }
  const items: Record<string, number> = {};
  for (const id of Object.keys(world.rewardItems).sort()) {
    const base = world.rewardItems[id]!;
    const exact = Math.round(base * factor * 1e9) / 1e9;
    let n = stochasticRound(exact, rewardRoll(outcome.runId, id));
    if (outcome.result === 'win' && base > 0) n = Math.max(1, n);
    items[id] = n;
  }
  return { factor, grade: outcome.score.grade, currencies, items, exp: runExpFor(content, level, factor) };
}

/** floor(x) + 1 with probability frac(x); `u` ∈ [0, 1). */
export function stochasticRound(x: number, u: number): number {
  const f = Math.floor(x);
  return x - f > u ? f + 1 : f;
}

/** Deterministic uniform [0, 1) from (runId, key): FNV-1a 32-bit + murmur finaliser. */
export function rewardRoll(runId: string, key: string): number {
  let h = 0x811c9dc5;
  const s = `${runId}|${key}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface ApplyResult {
  profile: Profile;
  rewards: RunRewards;
  /** False when this runId was already rewarded (profile returned unchanged). */
  applied: boolean;
  /** Global levels gained from this run's EXP. */
  levelsGained: number;
  /** Titles unlocked by this run (P2-05). */
  newTitles: string[];
}

/** Pure: returns a new profile with rewards (currencies, account EXP) and run stats applied. */
export function applyRunOutcome(profile: Profile, outcome: RunOutcome, content: ContentBundle, now: number): ApplyResult {
  const rewards = computeRunRewards(outcome, content, profile.level);
  if (profile.rewardedRuns.includes(outcome.runId)) return { profile, rewards, applied: false, levelsGained: 0, newTitles: [] };

  const leveled = grantExp(profile, content, rewards.exp);
  const p = leveled.profile === profile ? structuredClone(profile) : leveled.profile;
  for (const [id, amount] of Object.entries(rewards.currencies)) p.currencies[id] = (p.currencies[id] ?? 0) + amount;
  for (const [id, amount] of Object.entries(rewards.items)) if (amount > 0) p.items[id] = (p.items[id] ?? 0) + amount;

  const won = outcome.result === 'win';
  p.totals.runs++;
  if (won) p.totals.wins++;
  const k = outcome.score.kills;
  p.totals.kills += k.normal + k.elite + k.miniboss + k.boss;
  const prev: WorldProgress = p.worlds[outcome.worldId] ?? { cleared: false, runs: 0, wins: 0, bestScore: 0, bestGrade: null };
  p.worlds[outcome.worldId] = {
    cleared: prev.cleared || won,
    runs: prev.runs + 1,
    wins: prev.wins + (won ? 1 : 0),
    bestScore: Math.max(prev.bestScore, Math.max(0, Math.round(outcome.score.total))),
    bestGrade: won ? betterGrade(prev.bestGrade, outcome.score.grade) : prev.bestGrade,
  };

  p.rewardedRuns = [...p.rewardedRuns, outcome.runId].slice(-REWARDED_RUNS_KEPT);
  p.updatedAt = Math.max(p.updatedAt, now);
  const titled = unlockTitles(p, content, outcome);
  return { profile: titled.profile, rewards, applied: true, levelsGained: leveled.levelsGained, newTitles: titled.unlocked };
}
