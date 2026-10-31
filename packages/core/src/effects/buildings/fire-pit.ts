/**
 * "fire-pit": non-blocking trap. Every `interval` seconds, if any ground enemy is within `radius`,
 * it deals fire damage to all of them and sets them burning (see ../burning.ts).
 *
 * Friendly fire, documented: YES for wood. While it is firing, every flammable structure in a
 * neighbouring cell (distance <= `scorchRadius`, default 44 px = the 4 orthogonal neighbours;
 * diagonals are 56 px away and safe) is ignited. Put stone walls beside pits, or keep wooden walls
 * one cell clear. The pit itself is stone and fireproof.
 *
 * Params: damage, interval, radius, igniteSeconds, scorchRadius (0 disables).
 * Cooldown uses w.atkT (decremented by the sim). Damage scales with structureDamageMult.
 */
import { DamageType, Flag, Kind } from '../../constants';
import { num } from '../../params';
import { buildingBehaviors } from '../../registry';
import { igniteEnemy, processBurn } from '../burning';

buildingBehaviors.register({
  id: 'fire-pit',
  tick(ctx, e, params) {
    processBurn(ctx);
    const w = ctx.w, run = ctx.run;
    if (w.atkT[e] > 0) return;
    const radius = num(params, 'radius', 1, 60);
    const n = run.hash.query(w.x[e], w.y[e], radius, run.scratch2);
    const dmg = num(params, 'damage') * ctx.outgoingMult(e);
    const secs = num(params, 'igniteSeconds', 1, 3);
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const t = run.scratch2[i];
      if (!w.isAlive(t) || w.kind[t] !== Kind.Enemy || (w.flags[t] & Flag.Flying)) continue;
      const dx = w.x[t] - w.x[e], dy = w.y[t] - w.y[e];
      const reach = radius + w.radius[t];
      if (dx * dx + dy * dy > reach * reach) continue;
      hit++;
      igniteEnemy(ctx, t, secs);
      ctx.damage(t, dmg, DamageType.Fire, e);
    }
    if (hit === 0) return;
    w.atkT[e] = num(params, 'interval', 1, 1);
    const scorch = num(params, 'scorchRadius', 1, 44);
    if (scorch <= 0) return;
    const g = run.grid;
    const col = Math.floor((w.x[e] - g.originX) / g.cellSize), row = Math.floor((w.y[e] - g.originY) / g.cellSize);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = col + dc, r = row + dr;
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
      const s = g.cell[r * g.cols + c];
      if (s < 0 || !w.isAlive(s)) continue;
      const sx = w.x[s] - w.x[e], sy = w.y[s] - w.y[e];
      if (sx * sx + sy * sy <= scorch * scorch) ctx.ignite(s);
    }
  },
});
