/**
 * Generic stat card. Most cards need nothing else: put the numbers in content params.
 *
 * Every param whose name is a key of `Mods` is applied:
 * - keys ending in `Mult` are **added as a fraction** to the multiplier: `"damageMult": 0.2` → ×1.2;
 *   `"maxHpMult": -0.2` → ×0.8 (a drawback).
 * - every other key is added: `"projectileCountAdd": 1`, `"critChance": 0.1`, `"regenPerSec": 2`.
 * A number applies at every level; an array is a per-level table (index level-1).
 *
 * content/data/cards.json:
 *   { "id": "glass-edge", "effect": "stat-mods", "maxLevel": 3,
 *     "params": { "damageMult": [0.25, 0.4, 0.55], "maxHpMult": -0.2 }, … }
 */
import { num } from '../../params';
import { cardEffects } from '../../registry';
import type { Mods } from '../../types';

cardEffects.register({
  id: 'stat-mods',
  apply(mods, level, params) {
    for (const key of Object.keys(params).sort()) {
      if (!(key in mods)) continue;
      const k = key as keyof Mods;
      const v = num(params, key, level);
      if (key.endsWith('Mult')) mods[k] *= 1 + v;
      else mods[k] += v;
    }
  },
});
