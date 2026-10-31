/**
 * WORKED EXAMPLE — card effect with a hook and a drawback.
 *
 * "Blood Price": the hero heals a fraction of the damage they deal, but takes more damage.
 *
 * 1. Content (packages/content/data/cards.json):
 *      {
 *        "id": "blood-price", "effect": "lifesteal", "rarity": "rare", "maxLevel": 3,
 *        "nameKey": "card.blood-price.name", "descKey": "card.blood-price.desc",
 *        "drawbackKey": "card.blood-price.drawback",
 *        "params": { "leech": [0.04, 0.07, 0.1], "damageTaken": 0.15 }
 *      }
 * 2. Strings: add card.blood-price.{name,desc,drawback} to BOTH packages/i18n/src/locales/th.json
 *    and en.json. Descriptions may interpolate params: "Heal {{leech}}% of damage dealt".
 * 3. Code (this file): register under the id used in `effect`; import it from ./index.ts.
 * 4. Test: packages/core/test/effects.test.ts shows how to assert a card's effect in a few lines.
 *
 * Hooks available on a card (see CardEffect in src/registry.ts): apply (stats; pure), onPick,
 * onTick, onHeroHit, onKill. `level` is the card's current level (1-based).
 */
import { num } from '../../params';
import { cardEffects } from '../../registry';

cardEffects.register({
  id: 'lifesteal',
  // Stat part (the drawback). Pure: called on fresh Mods after every pick.
  apply(mods, level, params) {
    mods.damageTakenMult *= 1 + num(params, 'damageTaken', level);
  },
  // Behaviour part. ctx.heal clamps to max HP. Use ctx.run.hero for the player hero entity.
  onHeroHit(ctx, _target, amount, level, params) {
    ctx.heal(ctx.run.hero, amount * num(params, 'leech', level));
  },
});
