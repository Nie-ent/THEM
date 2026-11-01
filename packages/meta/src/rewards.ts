/**
 * Run result → profile (GDD §3, §12).
 *
 *   reward = floor(world.rewards[c] × rewardPct / 100 × lossFactor)
 *   lossFactor = wavesCleared / waveCount on a loss when content `meta.runRewards.lossScalesByWavesCleared`,
 *                else 1
 *
 * `rewardPct` comes from the run's grade (S 120, A 100, B 80, C 60); a loss is always the lowest band
 * (core caps it). Account EXP is added by P2-02 on top of this.
 *
 * Each outcome carries a `runId`; rewards for the same id are applied once (the profile remembers
 * the last REWARDED_RUNS_KEPT ids), so a retried save or a double event cannot pay twice.
 */
import type { ContentBundle, Grade } from '@them/content';
import { score as scoreOf, view, type Difficulty, type Run, type ScoreBreakdown } from '@them/core';
import { REWARDED_RUNS_KEPT, betterGrade, type Profile, type WorldProgress } from './profile';

export interface RunOutcome {
  runId: string;
  worldId: string;
  difficulty: Difficulty;
  result: 'win' | 'lose';
  score: ScoreBreakdown;
  wavesCleared: number;
  waveCount: number;
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
  };
}

export interface RunRewards {
  /** Effective fraction paid, after grade and loss scaling (e.g. 0.6 × 7/20). */
  factor: number;
  grade: Grade;
  currencies: Record<string, number>;
}

export function computeRunRewards(outcome: RunOutcome, content: ContentBundle): RunRewards {
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
  return { factor, grade: outcome.score.grade, currencies };
}

export interface ApplyResult {
  profile: Profile;
  rewards: RunRewards;
  /** False when this runId was already rewarded (profile returned unchanged). */
  applied: boolean;
}

/** Pure: returns a new profile with rewards and run stats applied. */
export function applyRunOutcome(profile: Profile, outcome: RunOutcome, content: ContentBundle, now: number): ApplyResult {
  const rewards = computeRunRewards(outcome, content);
  if (profile.rewardedRuns.includes(outcome.runId)) return { profile, rewards, applied: false };

  const p = structuredClone(profile);
  for (const [id, amount] of Object.entries(rewards.currencies)) p.currencies[id] = (p.currencies[id] ?? 0) + amount;

  const won = outcome.result === 'win';
  p.totals.runs++;
  if (won) p.totals.wins++;
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
  return { profile: p, rewards, applied: true };
}
