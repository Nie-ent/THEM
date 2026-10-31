/** Plays one headless run with the QA policy; optionally records the input log. */
import type { ContentBundle } from '../../packages/content/src/index';
import { createRun, score, step, view, type InputFrame, type Run, type RunConfig, type ScoreBreakdown } from '../../packages/core/src/index';
import { botInput, newMemory, type Mode } from './policy';

/** Hard stop: 60 sim-minutes. A run that hits it is reported as `timeout`. */
export const MAX_TICKS = 30 * 60 * 60;

export interface RunResult {
  seed: number;
  mode: Mode;
  result: 'win' | 'lose' | 'timeout';
  /** Wave the run ended on (1-based). */
  wave: number;
  cause: 'hero' | 'core' | null;
  score: ScoreBreakdown;
  ticks: number;
  simSeconds: number;
  wallMs: number;
  structuresBuilt: number;
}

export function playOne(
  content: ContentBundle, seed: number, mode: Mode,
  opts: { record?: InputFrame[]; config?: Partial<RunConfig>; maxTicks?: number } = {},
): { run: Run; out: RunResult } {
  const t0 = performance.now();
  const run = createRun({ worldId: content.worlds[0]!.id, ...opts.config }, content, seed);
  const mem = newMemory(mode);
  const max = opts.maxTicks ?? MAX_TICKS;
  let built = 0;
  while (run.phase !== 'ended' && run.tick < max) {
    const input = botInput(run, mem);
    opts.record?.push(input);
    step(run, input);
    for (const ev of run.events) if (ev.type === 'buildingPlaced') built++;
    run.events.length = 0;
  }
  const v = view(run);
  const e = v.entities;
  const cause = run.result === 'lose' ? (e.hp[v.hero]! <= 0 ? 'hero' : 'core') : null;
  return {
    run,
    out: {
      seed, mode,
      result: run.result ?? 'timeout',
      wave: v.wave,
      cause,
      score: score(run),
      ticks: run.tick,
      simSeconds: v.elapsed,
      wallMs: performance.now() - t0,
      structuresBuilt: built,
    },
  };
}
