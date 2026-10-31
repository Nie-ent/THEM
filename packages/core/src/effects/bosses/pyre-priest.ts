/**
 * Mini-boss script — "pyre-priest" (Ashmoth the Pyre-Priest, wave 15).
 *
 * Every `pyreEvery` s: MASS IGNITION. A big circle telegraph is laid over the whole build area
 * (centred on the Core, `targetsCore`, so it gets the violet Core-threat styling). When it lands,
 * every structure inside `pyreRadius` is set on fire: wood burns, stone resists. Wood-only bases
 * are punished; stone (or killing him first) is the counter. Also drops fire columns on the hero.
 * Phase 1 (≤ 50%) shortens the cooldown and adds a second column. Enrage halves cooldowns.
 */
import { DT } from '../../constants';
import { num } from '../../params';
import { bossScripts } from '../../registry';
import { massIgnite } from './util';

bossScripts.register({
  id: 'pyre-priest',
  onSpawn(_ctx, boss, params) {
    const s = boss.state;
    s.pyreT = num(params, 'firstPyreDelay', 1, 5);
    s.igniteIn = 0;
    s.colT = num(params, 'firstColumnDelay', 1, 2.5);
    s.cdMult = 1;
  },
  onEnrage(_ctx, boss) {
    boss.state.cdMult = 0.5;
  },
  tick(ctx, boss, phaseParams, params) {
    const w = ctx.w, run = ctx.run, s = boss.state;
    const c = run.core;
    const pyreRadius = num(params, 'pyreRadius', 1, 270);

    s.pyreT -= DT;
    if (s.pyreT <= 0) {
      s.pyreT = num(phaseParams, 'pyreEvery', 1, 12) * s.cdMult;
      const windup = Math.max(0.7, num(params, 'pyreWindup', 1, 1.8));
      s.igniteIn = windup;
      ctx.telegraph({
        shape: 'circle', x: w.x[c], y: w.y[c], r: pyreRadius,
        windup, damage: num(params, 'pyreDamage', 1, 8), targetsCore: true, owner: boss.e,
      });
    }
    if (s.igniteIn > 0) {
      s.igniteIn -= DT;
      if (s.igniteIn <= 0) massIgnite(ctx, w.x[c], w.y[c], pyreRadius);
    }

    s.colT -= DT;
    if (s.colT <= 0) {
      s.colT = num(phaseParams, 'columnEvery', 1, 5) * s.cdMult;
      const h = run.hero;
      const n = num(phaseParams, 'columns', 1, 1);
      for (let i = 0; i < n; i++) {
        ctx.telegraph({
          shape: 'circle',
          x: w.x[h] + (i === 0 ? 0 : ctx.rng.range(-120, 120)),
          y: w.y[h] + (i === 0 ? 0 : ctx.rng.range(-120, 120)),
          r: num(params, 'columnRadius', 1, 60), windup: num(params, 'columnWindup', 1, 1),
          damage: num(params, 'columnDamage', 1, 22), owner: boss.e,
        });
      }
    }
  },
});
