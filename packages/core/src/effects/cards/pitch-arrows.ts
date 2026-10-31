/**
 * "Pitch Arrows": hero hits set the target on fire; hits on an already-burning enemy deal bonus
 * fire damage. Drawback (stat part): pitch is heavy, so the hero fires slower.
 * Synergy: ember-ring ignites everything around the hero; pitch-arrows then cashes in on it.
 *
 * Params: igniteSeconds, burningBonus (fraction of the hit added as damage), cooldownMult.
 * The bonus goes through ctx.damage: inside onHeroHit it is queued and applied right after the
 * triggering hit, never kills twice and never re-triggers onHeroHit. Burning is an engine feature
 * (ctx.igniteEnemy; the sim deals world rules.burnDps per second and emits `burn` events).
 */
import { DamageType, Kind } from '../../constants';
import { num } from '../../params';
import { cardEffects } from '../../registry';

cardEffects.register({
  id: 'pitch-arrows',
  apply(mods, level, params) {
    mods.cooldownMult *= 1 + num(params, 'cooldownMult', level);
  },
  onHeroHit(ctx, target, amount, level, params) {
    if (ctx.w.kind[target] !== Kind.Enemy) return;
    if (ctx.isBurning(target)) ctx.damage(target, amount * num(params, 'burningBonus', level), DamageType.Fire, ctx.run.hero);
    ctx.igniteEnemy(target, num(params, 'igniteSeconds', level));
  },
});
