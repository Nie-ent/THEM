/**
 * "Ember Ring": a new weapon. Every `interval` seconds a pulse of fire hits every enemy within
 * `radius` of the hero and sets it burning. Damage scales with the hero's damage multiplier.
 * The timer lives in run.cardState (deterministic, hashed).
 * Params: damage, interval, radius, igniteSeconds (per-level tables allowed).
 */
import { DT, DamageType, Kind } from '../../constants';
import { num } from '../../params';
import { cardEffects } from '../../registry';

cardEffects.register({
  id: 'ember-ring',
  onTick(ctx, level, params) {
    const run = ctx.run, w = ctx.w;
    const key = 'ember-ring.t';
    const t = (run.cardState[key] ?? 0) - DT;
    if (t > 1e-9) { run.cardState[key] = t; return; }
    run.cardState[key] = num(params, 'interval', level, 2);
    const h = run.hero;
    const radius = num(params, 'radius', level, 90);
    const n = run.hash.query(w.x[h], w.y[h], radius, run.scratch2);
    const dmg = num(params, 'damage', level) * ctx.outgoingMult(h);
    const secs = num(params, 'igniteSeconds', level, 3);
    // The renderer draws the ring from this; without it the pulse is invisible when nothing is in range.
    ctx.emit({ type: 'pulse', e: h, x: w.x[h], y: w.y[h], r: radius, fire: true });
    for (let i = 0; i < n; i++) {
      const e = run.scratch2[i];
      if (!w.isAlive(e) || w.kind[e] !== Kind.Enemy) continue;
      const dx = w.x[e] - w.x[h], dy = w.y[e] - w.y[h];
      const reach = radius + w.radius[e];
      if (dx * dx + dy * dy > reach * reach) continue;
      ctx.igniteEnemy(e, secs);
      ctx.damage(e, dmg, DamageType.Fire, h);
    }
  },
});
