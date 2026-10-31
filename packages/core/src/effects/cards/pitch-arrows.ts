/**
 * "Pitch Arrows": hero hits set the target on fire; hits on an already-burning enemy deal bonus
 * fire damage. Drawback (stat part): pitch is heavy, so the hero fires slower.
 * Synergy: ember-ring ignites everything around the hero; pitch-arrows then cashes in on it.
 *
 * Params: igniteSeconds, burningBonus (fraction of the hit added as damage), cooldownMult.
 * The bonus is subtracted straight from HP (not via ctx.damage) because this hook runs inside the
 * hero's own damage call, which resolves the death itself; a nested ctx.damage could kill twice.
 */
import { Kind } from '../../constants';
import { num } from '../../params';
import { cardEffects } from '../../registry';
import { igniteEnemy, isBurning, processBurn } from '../burning';

cardEffects.register({
  id: 'pitch-arrows',
  apply(mods, level, params) {
    mods.cooldownMult *= 1 + num(params, 'cooldownMult', level);
  },
  onHeroHit(ctx, target, amount, level, params) {
    const w = ctx.w;
    if (w.kind[target] !== Kind.Enemy) return;
    if (isBurning(ctx, target) && w.hp[target] > 0) {
      const extra = amount * num(params, 'burningBonus', level);
      w.hp[target] -= extra;
      ctx.emit({ type: 'hit', e: target, uid: w.uid[target], kind: Kind.Enemy, amount: extra, crit: false, source: -1, x: w.x[target], y: w.y[target] });
    }
    igniteEnemy(ctx, target, num(params, 'igniteSeconds', level));
  },
  onTick(ctx) {
    processBurn(ctx);
  },
});
