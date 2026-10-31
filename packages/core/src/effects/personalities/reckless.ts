/**
 * AI hero personality "reckless" (GDD §8 บ้าบิ่น): charges the nearest enemy within `chaseRange`
 * of itself, even far outside the base, and never retreats. With nothing in sight it walks back
 * to its post (`w.hx/hy`). Melee heroes (weapon.projectileSpeed 0) hit as soon as they touch.
 * Params: chaseRange (px, detection around the hero), homeStop (px from the post counted as home).
 */
import { num } from '../../params';
import { personalities } from '../../registry';

personalities.register({
  id: 'reckless',
  tick(ctx, e, params) {
    const w = ctx.w;
    const chase = num(params, 'chaseRange', 1, 360);
    const t = ctx.nearestEnemy(w.x[e], w.y[e], chase);
    w.target[e] = t;
    let tx: number, ty: number;
    if (t >= 0) { tx = w.x[t]; ty = w.y[t]; } else { tx = w.hx[e]; ty = w.hy[e]; }
    const dx = tx - w.x[e], dy = ty - w.y[e];
    const d = Math.sqrt(dx * dx + dy * dy);
    const stop = t >= 0 ? w.radius[e] + w.radius[t] : num(params, 'homeStop', 1, 8);
    if (d > stop) { w.vx[e] = (dx / d) * w.speed[e]; w.vy[e] = (dy / d) * w.speed[e]; }
    else { w.vx[e] = 0; w.vy[e] = 0; }
    if (t >= 0) ctx.attack(e, t);
  },
});
