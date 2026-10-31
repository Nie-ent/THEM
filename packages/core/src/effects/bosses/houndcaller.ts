/**
 * Mini-boss script — "houndcaller" (Kharsa the Houndcaller, wave 10).
 *
 * Every `howlEvery` s she raises a HOWL: a circle telegraph on herself; when it lands the pack
 * arrives (`howlWolves` wolf riders around her), so the player can read it and punish her first.
 * Every `lanceEvery` s she also throws a long lance line at the hero. Phase 1 (≤ 50%) calls
 * bigger packs, faster. Wolf riders ignore aggro and dive the Core. Enrage halves cooldowns.
 */
import { DT } from '../../constants';
import { num } from '../../params';
import { bossScripts } from '../../registry';
import { dirTo, summon } from './util';

bossScripts.register({
  id: 'houndcaller',
  onSpawn(_ctx, boss, params) {
    const s = boss.state;
    s.howlT = num(params, 'firstHowlDelay', 1, 4);
    s.lanceT = num(params, 'firstLanceDelay', 1, 2.5);
    s.packIn = 0;
    s.packSize = 0;
    s.cdMult = 1;
  },
  onEnrage(_ctx, boss) {
    boss.state.cdMult = 0.5;
  },
  tick(ctx, boss, phaseParams, params) {
    const w = ctx.w, e = boss.e, s = boss.state;

    s.howlT -= DT;
    if (s.howlT <= 0) {
      s.howlT = num(phaseParams, 'howlEvery', 1, 9) * s.cdMult;
      const windup = Math.max(0.7, num(params, 'howlWindup', 1, 1.2));
      s.packIn = windup;
      s.packSize = num(phaseParams, 'howlWolves', 1, 3);
      ctx.telegraph({
        shape: 'circle', x: w.x[e], y: w.y[e], r: num(params, 'howlRadius', 1, 80),
        windup, damage: num(params, 'howlDamage', 1, 10), owner: e,
      });
    }
    if (s.packIn > 0) {
      s.packIn -= DT;
      if (s.packIn <= 0) summon(ctx, 'wolf-rider', s.packSize, w.x[e], w.y[e], 50);
    }

    s.lanceT -= DT;
    if (s.lanceT <= 0) {
      s.lanceT = num(phaseParams, 'lanceEvery', 1, 6) * s.cdMult;
      const d = dirTo(ctx, e, ctx.run.hero);
      ctx.telegraph({
        shape: 'rect', x: w.x[e], y: w.y[e], dx: d.dx, dy: d.dy,
        r: num(params, 'lanceLength', 1, 320), r2: num(params, 'lanceWidth', 1, 36) / 2,
        windup: num(params, 'lanceWindup', 1, 1.1), damage: num(params, 'lanceDamage', 1, 24), owner: e,
      });
    }
  },
});
