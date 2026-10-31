/**
 * Enemy burning (shared helper for P1-07 fire cards and the fire-pit trap).
 *
 * The engine only burns structures. Enemies reuse the same columns: `w.burnT[e]` is the seconds of
 * burning left and `Flag.Fire` marks a burning enemy for the renderer. Damage per second is the
 * world's `rules.burnDps` (the same number that burns wooden structures). Fire ignores armor.
 *
 * Every fire source calls `igniteEnemy`, then `processBurn(ctx)` from its own tick hook;
 * `processBurn` runs at most once per sim tick (guarded by `run.cardState['burn.tick']`, hashed),
 * so several sources never double the damage.
 */
import { DT, DamageType, Flag, Kind } from '../constants';
import type { Ctx } from '../ctx';

export function igniteEnemy(ctx: Ctx, e: number, seconds: number): void {
  const w = ctx.w;
  if (!w.isAlive(e) || w.kind[e] !== Kind.Enemy) return;
  if (seconds > w.burnT[e]) w.burnT[e] = seconds;
  w.flags[e] |= Flag.Fire;
}

export function isBurning(ctx: Ctx, e: number): boolean {
  return ctx.w.burnT[e] > 0;
}

export function processBurn(ctx: Ctx): void {
  const run = ctx.run, w = ctx.w;
  if (run.cardState['burn.tick'] === run.tick) return;
  run.cardState['burn.tick'] = run.tick;
  const dps = run.worldDef.rules.burnDps;
  for (let i = 0; i < w.highWater; i++) {
    if (w.kind[i] !== Kind.Enemy || w.burnT[i] <= 0) continue;
    w.burnT[i] -= DT;
    if (w.burnT[i] <= 0) { w.burnT[i] = 0; w.flags[i] &= ~Flag.Fire; }
    ctx.damage(i, dps * DT, DamageType.Fire, -1);
  }
}
