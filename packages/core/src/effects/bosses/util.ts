/** Small helpers shared by World 1 boss scripts (not a registry file). Pure; no module state. */
import { Kind } from '../../constants';
import type { Ctx } from '../../ctx';

export interface Dir { dx: number; dy: number; len: number }

/** Unit direction from entity `a` to entity `b` (casts are rare, so the tiny allocation is fine). */
export function dirTo(ctx: Ctx, a: number, b: number): Dir {
  const w = ctx.w;
  const dx = w.x[b] - w.x[a], dy = w.y[b] - w.y[a];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { dx: dx / len, dy: dy / len, len };
}

/** Spawn `count` copies of `enemyId` scattered around (x, y) within `spread` px. */
export function summon(ctx: Ctx, enemyId: string, count: number, x: number, y: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    ctx.spawnEnemy(enemyId, x + ctx.rng.range(-spread, spread), y + ctx.rng.range(-spread, spread));
  }
}

/** Ignite every structure within `r` px of (x, y). Wood burns, stone emits `resist`. */
export function massIgnite(ctx: Ctx, x: number, y: number, r: number): void {
  const run = ctx.run, w = ctx.w;
  for (let i = 0; i < run.playerSideCount; i++) {
    const s = run.playerSide[i];
    if (w.kind[s] !== Kind.Structure) continue;
    const dx = w.x[s] - x, dy = w.y[s] - y;
    if (dx * dx + dy * dy <= r * r) ctx.ignite(s);
  }
}
