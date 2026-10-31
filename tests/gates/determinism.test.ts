/**
 * QA gate: determinism (PHASE1 DoD "Determinism test green").
 * For 3 seeds, the QA bot plays a full run (real damage, no invulnerability) while recording its
 * input log. The log is serialised to JSON (as a ranked-score replay would be stored), parsed back,
 * and replayed on a fresh run: state hashes must match at every checkpoint and at the end, and the
 * final score must be identical. Independent of content: it uses whatever the bundle ships.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';
import { createRun, score, stateHash, step, type InputFrame } from '../../packages/core/src/index';
import { playOne } from '../balance/play';

const SEEDS = [11, 4242, 90001];
const CHECK_EVERY = 900; // 30 s of sim time

describe('determinism (QA gate)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: recorded input log replays to the identical state`, () => {
      const log: InputFrame[] = [];
      // Record hashes at checkpoints while playing.
      const { run: a, out } = playOne(content, seed, 'planner', { record: log });
      expect(log.length).toBeGreaterThan(0);
      expect(['win', 'lose']).toContain(out.result);

      const stored: InputFrame[] = JSON.parse(JSON.stringify(log));
      const b = createRun({ worldId: content.worlds[0]!.id }, content, seed);
      const c = createRun({ worldId: content.worlds[0]!.id }, content, seed);
      for (let i = 0; i < stored.length; i++) {
        step(b, stored[i]!);
        step(c, stored[i]!);
        b.events.length = 0;
        c.events.length = 0;
        if (i % CHECK_EVERY === 0) expect(stateHash(c), `tick ${i}`).toBe(stateHash(b));
      }
      expect(b.tick).toBe(a.tick);
      expect(b.phase).toBe(a.phase);
      expect(b.result).toBe(a.result);
      expect(stateHash(b)).toBe(stateHash(a));
      expect(score(b)).toEqual(score(a));
    });
  }

  it('different seeds with the same inputs diverge', () => {
    const log: InputFrame[] = [];
    playOne(content, SEEDS[0]!, 'no-build', { record: log, maxTicks: 30 * 90 });
    const x = createRun({ worldId: content.worlds[0]!.id }, content, SEEDS[0]!);
    const y = createRun({ worldId: content.worlds[0]!.id }, content, SEEDS[1]!);
    for (const f of log) { step(x, f); step(y, f); x.events.length = 0; y.events.length = 0; }
    expect(stateHash(y)).not.toBe(stateHash(x));
  });
});
