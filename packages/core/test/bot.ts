/**
 * Scripted test player: a deterministic function of (run state, tick) → InputFrame.
 * Orbits the Core, builds a fixed layout during prep, always picks card 0, rerolls once.
 * Used by the determinism test and the bench; the recorded input log is replayed for comparison.
 */
import type { ContentBundle } from '@them/content';
import { createRun, quantizeMove, step, view, type InputFrame, type Run } from '../src/api';

const BUILD_ORDER: { id: string; cell: number }[] = [
  { id: 'archer-tower-wood', cell: 4 * 13 + 6 },
  { id: 'wood-wall', cell: 3 * 13 + 6 },
  { id: 'stone-wall', cell: 6 * 13 + 4 },
  { id: 'archer-tower-wood', cell: 8 * 13 + 6 },
  { id: 'stone-wall', cell: 6 * 13 + 8 },
  { id: 'archer-tower-wood', cell: 6 * 13 + 3 },
  { id: 'archer-tower-wood', cell: 6 * 13 + 9 },
];

/** Precomputed orbit directions (no trig in sim-adjacent code that feeds inputs). */
const DIRS: [number, number][] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];

export function botInput(run: Run): InputFrame {
  const v = view(run);
  const input: InputFrame = { moveX: 0, moveY: 0 };
  if (v.draft) {
    if (v.rerollsLeft === 2 && v.level === 3) input.reroll = true;
    else input.pickCard = 0;
    return input;
  }
  if (v.phase === 'prep') {
    const next = BUILD_ORDER.find((b) => v.grid.cell[b.cell] === -1);
    if (next && v.tick % 3 === 0) input.build = { buildingId: next.id, cell: next.cell };
    if (v.prepTimeLeft < 20 && v.wave % 2 === 0) input.callWave = true;
    return input;
  }
  const d = DIRS[Math.floor(v.tick / 45) % DIRS.length]!;
  const e = v.entities;
  // Stay within ~250px of the Core: steer back when far.
  const dx = e.x[v.core]! - e.x[v.hero]!, dy = e.y[v.core]! - e.y[v.hero]!;
  const far = dx * dx + dy * dy > 250 * 250;
  const q = far ? quantizeMove(dx / 250, dy / 250) : quantizeMove(d[0], d[1]);
  return { ...input, ...q };
}

export interface ScriptedResult {
  run: Run;
  inputs: InputFrame[];
}

/** Play until the run ends or `maxTicks`, recording inputs. */
export function playScripted(content: ContentBundle, seed: number, maxTicks: number, invulnerable = true): ScriptedResult {
  const run = createRun({ worldId: 'garroth' }, content, seed);
  run.debugInvulnerable = invulnerable;
  const inputs: InputFrame[] = [];
  while (run.phase !== 'ended' && run.tick < maxTicks) {
    const input = botInput(run);
    inputs.push(input);
    step(run, input);
    run.events.length = 0;
  }
  return { run, inputs };
}

export function replay(content: ContentBundle, seed: number, inputs: InputFrame[], invulnerable = true): Run {
  const run = createRun({ worldId: 'garroth' }, content, seed);
  run.debugInvulnerable = invulnerable;
  for (const i of inputs) {
    step(run, i);
    run.events.length = 0;
  }
  return run;
}
