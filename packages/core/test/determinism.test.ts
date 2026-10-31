import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, step, stateHash, view } from '../src/api';
import { playScripted, replay } from './bot';

const MAX_TICKS = 30 * 60 * 40;

describe('determinism', () => {
  it('same seed + same input log ⇒ identical state hash after 20 waves', () => {
    const a = playScripted(content, 1337, MAX_TICKS);
    expect(a.run.phase).toBe('ended');
    expect(view(a.run).wave).toBe(20);
    expect(a.run.result).toBe('win');
    const b = replay(content, 1337, a.inputs);
    expect(stateHash(b)).toBe(stateHash(a.run));
    expect(b.tick).toBe(a.run.tick);
  });

  it('hashes match at every 600th tick, not only at the end', () => {
    const a = playScripted(content, 99, 30 * 60 * 6, false);
    const runA = createRun({ worldId: 'garroth' }, content, 99);
    const runB = createRun({ worldId: 'garroth' }, content, 99);
    for (let i = 0; i < a.inputs.length; i++) {
      step(runA, a.inputs[i]!);
      step(runB, a.inputs[i]!);
      runA.events.length = 0;
      runB.events.length = 0;
      if (i % 600 === 0) expect(stateHash(runB)).toBe(stateHash(runA));
    }
    expect(stateHash(runB)).toBe(stateHash(a.run));
  });

  it('different seeds diverge', () => {
    const a = playScripted(content, 1, 30 * 120);
    const b = replay(content, 2, a.inputs);
    expect(stateHash(b)).not.toBe(stateHash(a.run));
  });
});
