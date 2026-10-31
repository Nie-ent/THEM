import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng';

describe('Rng', () => {
  it('is reproducible for the same seed', () => {
    const a = new Rng(1234), b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.u32()).toBe(b.u32());
  });

  it('pins the sequence (guards against accidental algorithm changes)', () => {
    const r = new Rng(42);
    expect([r.u32(), r.u32(), r.u32()]).toMatchSnapshot();
  });

  it('differs across seeds', () => {
    const a = new Rng(1), b = new Rng(2);
    const sa = Array.from({ length: 8 }, () => a.u32());
    const sb = Array.from({ length: 8 }, () => b.u32());
    expect(sa).not.toEqual(sb);
  });

  it('float is in [0,1) and roughly uniform', () => {
    const r = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      buckets[Math.floor(f * 10)]++;
    }
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });

  it('int(n) stays in range and hits every value', () => {
    const r = new Rng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('weighted respects zero weights and proportions', () => {
    const r = new Rng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) counts[r.weighted([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.6);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.4);
    expect(r.weighted([0, 0])).toBe(-1);
  });

  it('fork gives independent, reproducible streams', () => {
    const a = new Rng(5).fork(1), b = new Rng(5).fork(1), c = new Rng(5).fork(2);
    const x = a.u32();
    expect(b.u32()).toBe(x);
    expect(c.u32()).not.toBe(x);
  });
});
