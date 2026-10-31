/**
 * Seeded RNG: sfc32 (Small Fast Counting, 128-bit state), seeded through splitmix32.
 * Pure 32-bit integer math (`Math.imul`, `>>>`), so it is bit-identical on every JS engine.
 * State is four uint32s and can be hashed / serialised for replays.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    let s = seed >>> 0;
    const next = (): number => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.u32();
  }

  /** Uniform uint32. */
  u32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.u32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Uniform integer in [0, n). Unbiased (rejection sampling). */
  int(n: number): number {
    if (n <= 0) return 0;
    const limit = 4294967296 - (4294967296 % n);
    let v = this.u32();
    while (v >= limit) v = this.u32();
    return v % n;
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Index chosen proportionally to `weights` (all >= 0). Returns -1 if all are 0. */
  weighted(weights: ArrayLike<number>): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i] as number;
    if (total <= 0) return -1;
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Derive an independent stream (used to give spawns, cards and combat their own streams). */
  fork(salt: number): Rng {
    return new Rng((this.u32() ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
  }

  state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }
}
