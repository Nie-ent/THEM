/**
 * Enemy behaviour — "drum-buff" (war drummer). Every tick, every other living enemy within `radius`
 * px gets `damageMult` on its outgoing damage and `speedMult` on its speed. Buffs do not stack
 * (the best one wins) and reset each tick, so killing the drummer ends the buff instantly.
 * Params: radius, damageMult, speedMult. Reads/writes only `w.buff` / `w.speedBuff`.
 */
import { Kind } from '../../constants';
import { num } from '../../params';
import { enemyBehaviors } from '../../registry';

enemyBehaviors.register({
  id: 'drum-buff',
  tick(ctx, e, params) {
    const w = ctx.w, run = ctx.run;
    const r = num(params, 'radius', 1, 120);
    const dm = num(params, 'damageMult', 1, 1.3);
    const sm = num(params, 'speedMult', 1, 1.2);
    const n = run.hash.query(w.x[e], w.y[e], r, run.scratch2);
    for (let i = 0; i < n; i++) {
      const o = run.scratch2[i];
      if (o === e || w.kind[o] !== Kind.Enemy) continue;
      const dx = w.x[o] - w.x[e], dy = w.y[o] - w.y[e];
      if (dx * dx + dy * dy > r * r) continue;
      if (w.buff[o] < dm) w.buff[o] = dm;
      if (w.speedBuff[o] < sm) w.speedBuff[o] = sm;
    }
  },
});
