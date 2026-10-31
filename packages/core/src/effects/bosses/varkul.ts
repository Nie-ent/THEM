/**
 * Boss script — "varkul" (Varkul, the Unbeaten; wave 20). Three phases, all numbers in bosses.json.
 *
 *  Phase 0 (100%):  WARLORD'S CLEAVE (cone on the hero) + WAR-CALL (raiders and slingers).
 *  Phase 1 (≤ 66%): adds the CORE LANCE (a long line aimed at the Core, `targetsCore`), and the
 *                   war-call brings a war drummer and wolf riders.
 *  Phase 2 (≤ 33%): adds the BROKEN GROUND (ring: stand inside the safe hole or outside it), the
 *                   PYRE-BANNER (mass ignition of the build area, same rule as the torch-bearers), and
 *                   fires two Core lances in a cross. The war-call gets torch-bearers.
 * Every phase change flings an immediate war-call. Enrage (bosses.json `enrageSeconds`) halves all
 * cooldowns on top of the sim's damage/speed multipliers, so the fight cannot be stalled.
 * Each attack is a telegraph with windup >= 0.7 s (readability §5); Core attacks set targetsCore.
 */
import type { Params } from '@them/content';
import { DT } from '../../constants';
import type { Ctx } from '../../ctx';
import { num } from '../../params';
import { bossScripts } from '../../registry';
import { dirTo, massIgnite, summon } from './util';

function warCall(ctx: Ctx, e: number, phaseParams: Params): void {
  const x = ctx.w.x[e], y = ctx.w.y[e];
  summon(ctx, 'raider', num(phaseParams, 'callRaiders'), x, y, 60);
  summon(ctx, 'slinger', num(phaseParams, 'callSlingers'), x, y, 60);
  summon(ctx, 'wolf-rider', num(phaseParams, 'callWolves'), x, y, 60);
  summon(ctx, 'torch-bearer', num(phaseParams, 'callTorches'), x, y, 60);
  summon(ctx, 'war-drummer', num(phaseParams, 'callDrummers'), x, y, 60);
}

bossScripts.register({
  id: 'varkul',
  onSpawn(_ctx, boss, params) {
    const s = boss.state;
    s.cleaveT = num(params, 'firstCleaveDelay', 1, 3);
    s.callT = num(params, 'firstCallDelay', 1, 6);
    s.lanceT = 0;
    s.quakeT = 0;
    s.pyreT = 0;
    s.igniteIn = 0;
    s.cdMult = 1;
  },
  onPhase(ctx, boss, phaseParams) {
    const s = boss.state;
    s.lanceT = num(phaseParams, 'lanceEvery') > 0 ? num(phaseParams, 'firstLanceDelay', 1, 2.5) : 0;
    s.quakeT = num(phaseParams, 'quakeEvery') > 0 ? num(phaseParams, 'firstQuakeDelay', 1, 3) : 0;
    s.pyreT = num(phaseParams, 'pyreEvery') > 0 ? num(phaseParams, 'firstPyreDelay', 1, 4) : 0;
    s.callT = num(phaseParams, 'callEvery', 1, 12);
    warCall(ctx, boss.e, phaseParams);
  },
  onEnrage(_ctx, boss) {
    boss.state.cdMult = 0.5;
  },
  tick(ctx, boss, phaseParams, params) {
    const w = ctx.w, run = ctx.run, e = boss.e, s = boss.state;

    s.cleaveT -= DT;
    if (s.cleaveT <= 0) {
      s.cleaveT = num(phaseParams, 'cleaveEvery', 1, 5) * s.cdMult;
      const d = dirTo(ctx, e, run.hero);
      ctx.telegraph({
        shape: 'cone', x: w.x[e], y: w.y[e], dx: d.dx, dy: d.dy,
        r: num(params, 'cleaveRange', 1, 150), r2: num(params, 'cleaveCos', 1, 0.5),
        windup: num(params, 'cleaveWindup', 1, 1), damage: num(params, 'cleaveDamage', 1, 30), owner: e,
      });
    }

    const callEvery = num(phaseParams, 'callEvery');
    if (callEvery > 0) {
      s.callT -= DT;
      if (s.callT <= 0) {
        s.callT = callEvery * s.cdMult;
        warCall(ctx, e, phaseParams);
      }
    }

    const lanceEvery = num(phaseParams, 'lanceEvery');
    if (lanceEvery > 0) {
      s.lanceT -= DT;
      if (s.lanceT <= 0) {
        s.lanceT = lanceEvery * s.cdMult;
        const c = run.core;
        const d = dirTo(ctx, e, c);
        const lances = num(phaseParams, 'lances', 1, 1);
        const reach = d.len + w.radius[c];
        for (let i = 0; i < lances; i++) {
          // Lance 0 comes from Varkul. Extra lances cross it at 90° through the Core.
          const dx = i === 0 ? d.dx : (i % 2 === 1 ? -d.dy : d.dy);
          const dy = i === 0 ? d.dy : (i % 2 === 1 ? d.dx : -d.dx);
          const half = reach * 0.5;
          ctx.telegraph({
            shape: 'rect',
            x: i === 0 ? w.x[e] : w.x[c] - dx * half,
            y: i === 0 ? w.y[e] : w.y[c] - dy * half,
            dx, dy, r: i === 0 ? reach : reach,
            r2: num(phaseParams, 'lanceWidth', 1, 50) / 2,
            windup: num(phaseParams, 'lanceWindup', 1, 1.6), damage: num(phaseParams, 'lanceDamage', 1, 70),
            targetsCore: true, owner: e,
          });
        }
      }
    }

    const quakeEvery = num(phaseParams, 'quakeEvery');
    if (quakeEvery > 0) {
      s.quakeT -= DT;
      if (s.quakeT <= 0) {
        s.quakeT = quakeEvery * s.cdMult;
        ctx.telegraph({
          shape: 'ring', x: w.x[e], y: w.y[e], r: num(params, 'quakeOuter', 1, 260), r2: num(params, 'quakeInner', 1, 80),
          windup: num(params, 'quakeWindup', 1, 1.3), damage: num(params, 'quakeDamage', 1, 40), owner: e,
        });
      }
    }

    const pyreEvery = num(phaseParams, 'pyreEvery');
    if (pyreEvery > 0) {
      s.pyreT -= DT;
      if (s.pyreT <= 0) {
        s.pyreT = pyreEvery * s.cdMult;
        const c = run.core;
        const windup = Math.max(0.7, num(params, 'pyreWindup', 1, 1.8));
        s.igniteIn = windup;
        ctx.telegraph({
          shape: 'circle', x: w.x[c], y: w.y[c], r: num(params, 'pyreRadius', 1, 270),
          windup, damage: num(params, 'pyreDamage', 1, 10), targetsCore: true, owner: e,
        });
      }
    }
    if (s.igniteIn > 0) {
      s.igniteIn -= DT;
      if (s.igniteIn <= 0) massIgnite(ctx, w.x[run.core], w.y[run.core], num(params, 'pyreRadius', 1, 270));
    }
  },
});
