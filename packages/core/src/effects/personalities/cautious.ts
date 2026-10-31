/**
 * WORKED EXAMPLE — AI hero personality (GDD §8 "ระมัดระวัง": never leaves its post).
 *
 * 1. Content (packages/content/data/heroes.json):
 *      {
 *        "id": "mira", "personality": "cautious", "stars": 2,
 *        "nameKey": "hero.mira.name", "descKey": "hero.mira.desc", "personalityKey": "personality.cautious",
 *        "hp": 140, "speed": 120, "radius": 12,
 *        "weapon": { "damage": 10, "cooldown": 0.7, "range": 240, "projectileSpeed": 520 },
 *        "params": { "leash": 40 }, "render": { "shape": "rounded-square" }
 *      }
 * 2. Strings in th.json + en.json. 3. Register here, import from ./index.ts.
 *
 * Contract: `tick` runs each wave tick while the ally is up. Steer by writing `w.vx/vy` in px/s
 * (the movement system clamps to the hero's speed and resolves walls). Fight with
 * `ctx.attack(e, target)` — it checks range/cooldown and fires the weapon from content.
 * The post is `w.hx/hy` (moved by the player during prep). Personality numbers live in `params`.
 */
import { num } from '../../params';
import { personalities } from '../../registry';

personalities.register({
  id: 'cautious',
  tick(ctx, e, params) {
    const w = ctx.w;
    const leash = num(params, 'leash', 1, 40);
    // Stay within `leash` px of the post.
    const dx = w.hx[e] - w.x[e], dy = w.hy[e] - w.y[e];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > leash * 0.5) { w.vx[e] = (dx / d) * w.speed[e]; w.vy[e] = (dy / d) * w.speed[e]; }
    else { w.vx[e] = 0; w.vy[e] = 0; }
    // Shoot whatever is in range; never chase.
    const t = ctx.nearestEnemy(w.x[e], w.y[e], w.wRange[e] + w.radius[e]);
    w.target[e] = t;
    if (t >= 0) ctx.attack(e, t);
  },
});
