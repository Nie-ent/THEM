/**
 * Uniform-grid spatial hash. Zero allocation after construction: buckets are intrusive linked
 * lists in Int32Arrays and the hash is rebuilt from scratch every tick (cheaper than incremental
 * updates when most entities move). Insertion happens in ascending entity index, so query order is
 * deterministic.
 */
export class SpatialHash {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly ex: Float64Array;
  private readonly ey: Float64Array;
  /** Largest radius inserted since the last clear; queries widen by it. */
  maxRadius = 0;

  constructor(width: number, height: number, cellSize: number, capacity: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(capacity).fill(-1);
    this.ex = new Float64Array(capacity);
    this.ey = new Float64Array(capacity);
  }

  clear(): void {
    this.head.fill(-1);
    this.maxRadius = 0;
  }

  private cx(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cy(y: number): number {
    const c = Math.floor(y / this.cellSize);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  insert(id: number, x: number, y: number, radius = 0): void {
    const cell = this.cy(y) * this.cols + this.cx(x);
    this.next[id] = this.head[cell]!;
    this.head[cell] = id;
    this.ex[id] = x;
    this.ey[id] = y;
    if (radius > this.maxRadius) this.maxRadius = radius;
  }

  /**
   * Writes ids whose inserted point lies within `r + maxRadius` of (x, y) into `out`; returns the
   * count. Callers do the exact circle test (they know each entity's radius).
   */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const reach = r + this.maxRadius;
    const x0 = this.cx(x - reach), x1 = this.cx(x + reach);
    const y0 = this.cy(y - reach), y1 = this.cy(y + reach);
    const reach2 = reach * reach;
    let n = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        let id = this.head[gy * this.cols + gx]!;
        while (id !== -1) {
          const dx = this.ex[id]! - x, dy = this.ey[id]! - y;
          if (dx * dx + dy * dy <= reach2) {
            if (n >= out.length) return n;
            out[n++] = id;
          }
          id = this.next[id]!;
        }
      }
    }
    return n;
  }
}
