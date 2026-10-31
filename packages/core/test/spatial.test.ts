import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng';
import { SpatialHash } from '../src/spatial';

describe('SpatialHash', () => {
  it('returns exactly the points a brute-force scan finds (superset filtered by distance)', () => {
    const rng = new Rng(3);
    const N = 2000;
    const xs = new Float64Array(N), ys = new Float64Array(N);
    const h = new SpatialHash(1000, 1000, 50, N);
    for (let i = 0; i < N; i++) {
      xs[i] = rng.range(0, 1000);
      ys[i] = rng.range(0, 1000);
      h.insert(i, xs[i]!, ys[i]!);
    }
    const out = new Int32Array(N);
    for (let q = 0; q < 200; q++) {
      const qx = rng.range(-50, 1050), qy = rng.range(-50, 1050), r = rng.range(0, 150);
      const n = h.query(qx, qy, r, out);
      const got = new Set(Array.from(out.subarray(0, n)));
      for (let i = 0; i < N; i++) {
        const dx = xs[i]! - qx, dy = ys[i]! - qy;
        const inside = dx * dx + dy * dy <= r * r;
        if (inside) expect(got.has(i)).toBe(true);
      }
      for (const i of got) {
        const dx = xs[i]! - qx, dy = ys[i]! - qy;
        expect(dx * dx + dy * dy).toBeLessThanOrEqual(r * r + 1e-9);
      }
    }
  });

  it('widens queries by the largest inserted radius', () => {
    const h = new SpatialHash(500, 500, 32, 4);
    h.insert(0, 100, 100, 40);
    const out = new Int32Array(4);
    expect(h.query(150, 100, 20, out)).toBe(1); // centre 50 away; reach 20 + 40
  });

  it('clamps out-of-bounds points into edge cells and clears', () => {
    const h = new SpatialHash(100, 100, 10, 4);
    h.insert(0, -20, -20);
    h.insert(1, 500, 500);
    const out = new Int32Array(4);
    expect(h.query(-20, -20, 1, out)).toBe(1);
    expect(h.query(500, 500, 1, out)).toBe(1);
    h.clear();
    expect(h.query(-20, -20, 1000, out)).toBe(0);
  });

  it('query order is deterministic (descending insert order within a cell)', () => {
    const h = new SpatialHash(100, 100, 100, 8);
    for (let i = 0; i < 5; i++) h.insert(i, 50, 50);
    const out = new Int32Array(8);
    const n = h.query(50, 50, 1, out);
    expect(Array.from(out.subarray(0, n))).toEqual([4, 3, 2, 1, 0]);
  });
});
