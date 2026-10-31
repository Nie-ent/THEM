/**
 * WORKED EXAMPLE — a tiny two-phase boss script.
 *
 * Phase 0 (100%–50% HP): every `slamEvery` s, telegraph a circle slam on the hero.
 * Phase 1 (≤ 50% HP):    additionally, every `coreEvery` s, telegraph a line charge at the Core
 *                        (targetsCore → violet styling + HUD flash + edge arrow, readability §5).
 * Enrage: after `enrageSeconds` (bosses.json), stats are multiplied by the sim; the script halves
 *         its cooldowns.
 *
 * 1. Content (packages/content/data/bosses.json):
 *      {
 *        "id": "trial-brute", "nameKey": "boss.trial-brute.name", "script": "slam-and-charge",
 *        "enrageSeconds": 90,
 *        "params": { "slamRadius": 90, "slamDamage": 30, "slamWindup": 1.2 },
 *        "phases": [
 *          { "hpBelow": 1,   "params": { "slamEvery": 5 } },
 *          { "hpBelow": 0.5, "params": { "slamEvery": 4, "coreEvery": 7, "coreDamage": 60, "coreWidth": 50 } }
 *        ]
 *      }
 *    and an enemy with `"tier": "miniboss"` (or "boss"), `"boss": "trial-brute"` spawned by a wave.
 * 2. Strings: boss.trial-brute.name in th.json + en.json.
 * 3. Register here, import from ./index.ts.
 *
 * Contract: movement + basic weapon are the normal enemy systems (from the enemy def). The script
 * adds special attacks. Keep timers in `boss.state` (hashed for determinism), never in closures or
 * module variables. `phaseParams` is the current phase's params, `params` the boss-level ones.
 * Telegraph windup is clamped to ≥ 0.7 s; damage lands on hero/allies/structures/Core inside the
 * shape at impact; it is cancelled if the boss dies first.
 */
import { DT } from '../../constants';
import { num } from '../../params';
import { bossScripts } from '../../registry';

bossScripts.register({
  id: 'slam-and-charge',
  onSpawn(_ctx, boss, params) {
    boss.state.slamT = num(params, 'firstSlamDelay', 1, 2);
    boss.state.coreT = 0;
    boss.state.cdMult = 1;
  },
  onPhase(_ctx, boss, phaseParams) {
    // Start the Core attack timer when the phase that has one begins.
    if (num(phaseParams, 'coreEvery') > 0) boss.state.coreT = 1.5;
  },
  onEnrage(_ctx, boss) {
    boss.state.cdMult = 0.5;
  },
  tick(ctx, boss, phaseParams, params) {
    const w = ctx.w, e = boss.e, dt = DT;
    const s = boss.state;

    s.slamT -= dt;
    if (s.slamT <= 0) {
      s.slamT = num(phaseParams, 'slamEvery', 1, 5) * s.cdMult;
      const h = ctx.run.hero;
      ctx.telegraph({
        shape: 'circle', x: w.x[h], y: w.y[h], r: num(params, 'slamRadius', 1, 80),
        windup: num(params, 'slamWindup', 1, 1.2), damage: num(params, 'slamDamage', 1, 20), owner: e,
      });
    }

    const coreEvery = num(phaseParams, 'coreEvery');
    if (coreEvery > 0) {
      s.coreT -= dt;
      if (s.coreT <= 0) {
        s.coreT = coreEvery * s.cdMult;
        const c = ctx.run.core;
        const dx = w.x[c] - w.x[e], dy = w.y[c] - w.y[e];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        ctx.telegraph({
          shape: 'rect', x: w.x[e], y: w.y[e], dx: dx / len, dy: dy / len, r: len + w.radius[c],
          r2: num(phaseParams, 'coreWidth', 1, 40) / 2, windup: num(phaseParams, 'coreWindup', 1, 1.5),
          damage: num(phaseParams, 'coreDamage', 1, 50), targetsCore: true, owner: e,
        });
      }
    }
  },
});
