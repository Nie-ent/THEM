/**
 * WORKED EXAMPLE — enemy behaviour (World 1 rule: torch-bearers set wooden structures on fire).
 *
 * Enemy def:  "targeting": "structure", "behaviors": [{ "id": "ignite" }]
 * Any melee hit on a structure calls ctx.ignite, which burns flammable (wood) structures for
 * world.rules.burnSeconds at world.rules.burnDps and emits `burn: resist` on stone.
 */
import { enemyBehaviors } from '../../registry';
import { Kind } from '../../constants';

enemyBehaviors.register({
  id: 'ignite',
  onMeleeHit(ctx, _e, target) {
    if (ctx.w.kind[target] === Kind.Structure) ctx.ignite(target);
  },
});
