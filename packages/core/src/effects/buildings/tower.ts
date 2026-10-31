/**
 * WORKED EXAMPLE — building behaviour.
 *
 * "tower": shoots the nearest enemy in range with projectiles. The archer tower uses it.
 *
 * 1. Content (packages/content/data/buildings.json):
 *      {
 *        "id": "archer-tower-wood", "behavior": "tower", "material": "wood",
 *        "nameKey": "building.archer-tower-wood.name", "descKey": "building.archer-tower-wood.desc",
 *        "cost": { "wood": 8 }, "upkeep": { "wood": 1 }, "hp": 160, "flammable": true, "blocking": true,
 *        "params": { "damage": 9, "cooldown": 0.8, "range": 220, "projectileSpeed": 520 },
 *        "render": { "shape": "square-tower" }
 *      }
 * 2. Strings in th.json + en.json. 3. Register here, import from ./index.ts.
 *
 * Pattern: `onPlace` copies params into the entity's weapon columns once; `tick` picks a target and
 * calls `ctx.attack`, which handles range, cooldown, projectiles, damage multipliers (cards'
 * structureDamageMult and the difficulty limiter) and events. Cooldowns tick down automatically.
 * Per-entity state, if you need it, goes in `ctx.w.aux0[e]` / `aux1[e]`.
 */
import { DamageType } from '../../constants';
import { num, str } from '../../params';
import { buildingBehaviors } from '../../registry';

buildingBehaviors.register({
  id: 'tower',
  onPlace(ctx, e, params) {
    const w = ctx.w;
    w.wDamage[e] = num(params, 'damage');
    w.wCooldown[e] = num(params, 'cooldown', 1, 1);
    w.wRange[e] = num(params, 'range', 1, 200);
    w.wProjSpeed[e] = num(params, 'projectileSpeed', 1, 500);
    w.wProjRadius[e] = num(params, 'projectileRadius', 1, 4);
    w.wPierce[e] = num(params, 'pierce');
    w.wCount[e] = num(params, 'count', 1, 1);
    w.wType[e] = str(params, 'damageType') === 'fire' ? DamageType.Fire : DamageType.Physical;
  },
  tick(ctx, e) {
    const w = ctx.w;
    if (w.atkT[e] > 0) return;
    const target = ctx.nearestEnemy(w.x[e], w.y[e], w.wRange[e] + w.radius[e]);
    w.target[e] = target;
    if (target >= 0) ctx.attack(e, target);
  },
});
