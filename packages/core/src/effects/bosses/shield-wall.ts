/**
 * Mini-boss script — "shield-wall" (Brannok, Shieldwall Chieftain, wave 5).
 *
 * Cycles between SHIELD UP (armor raised to `shieldArmor`: physical is mostly wasted, fire is not)
 * and SHIELD DOWN (vulnerable). Every `bashEvery` s he telegraphs a cone shield-bash at the hero.
 * Phase 1 (≤ 50% HP) shortens the vulnerable window and calls raiders behind the wall.
 * Counter: fire (ignores armor), or burst him while the shield is down. `state.up` is 1 while the
 * shield is raised (the renderer can read the entity's armor column to draw it).
 * Enrage: cooldowns halve. All numbers in bosses.json.
 */
import { DT } from '../../constants';
import { num } from '../../params';
import { bossScripts } from '../../registry';
import { dirTo, summon } from './util';

bossScripts.register({
  id: 'shield-wall',
  onSpawn(ctx, boss, params) {
    const s = boss.state;
    s.baseArmor = ctx.w.armor[boss.e];
    s.up = 0;
    s.shieldT = num(params, 'firstShieldDelay', 1, 4);
    s.bashT = num(params, 'firstBashDelay', 1, 3);
    s.callT = 0;
    s.cdMult = 1;
  },
  onPhase(_ctx, boss, phaseParams) {
    if (num(phaseParams, 'callEvery') > 0) boss.state.callT = 3;
  },
  onEnrage(_ctx, boss) {
    boss.state.cdMult = 0.5;
  },
  tick(ctx, boss, phaseParams, params) {
    const w = ctx.w, e = boss.e, s = boss.state;
    s.shieldT -= DT;
    if (s.shieldT <= 0) {
      if (s.up === 0) {
        s.up = 1;
        w.armor[e] = num(params, 'shieldArmor', 1, 0.85);
        s.shieldT = num(phaseParams, 'shieldUp', 1, 4);
      } else {
        s.up = 0;
        w.armor[e] = s.baseArmor;
        s.shieldT = num(phaseParams, 'shieldDown', 1, 4) * s.cdMult;
      }
    }

    s.bashT -= DT;
    if (s.bashT <= 0) {
      s.bashT = num(phaseParams, 'bashEvery', 1, 5) * s.cdMult;
      const d = dirTo(ctx, e, ctx.run.hero);
      ctx.telegraph({
        shape: 'cone', x: w.x[e], y: w.y[e], dx: d.dx, dy: d.dy,
        r: num(params, 'bashRange', 1, 130), r2: num(params, 'bashCos', 1, 0.7),
        windup: num(params, 'bashWindup', 1, 1), damage: num(params, 'bashDamage', 1, 22), owner: e,
      });
    }

    const callEvery = num(phaseParams, 'callEvery');
    if (callEvery > 0) {
      s.callT -= DT;
      if (s.callT <= 0) {
        s.callT = callEvery * s.cdMult;
        summon(ctx, 'raider', num(phaseParams, 'callCount', 1, 4), w.x[e], w.y[e], 40);
      }
    }
  },
});
