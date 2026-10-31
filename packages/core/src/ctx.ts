/**
 * The simulation context: the run plus the verbs that systems and registry code use to act on it.
 * Registry code (cards, buildings, personalities, boss scripts, enemy behaviours) must only change
 * the world through these verbs or by writing entity columns of the entity it was handed, so that
 * events, kill tallies and scoring stay consistent.
 */
import { DamageType, FAN_COS, FAN_SIN, Flag, Kind, PickupType, Team } from './constants';
import type { BossRuntime, Run, SimEvent, TelegraphSpec } from './types';
import type { Rng } from './rng';
import type { World } from './world';

export interface Ctx {
  readonly run: Run;
  readonly w: World;
  /** Combat RNG stream. Registry code must use this, never Math.random. */
  readonly rng: Rng;
  emit(ev: SimEvent): void;
  /**
   * Deal damage. Physical damage is reduced by the target's armor; fire ignores armor. A target
   * dies exactly once: damage to a dead/dying entity is ignored. Safe to call from any hook,
   * including `onHeroHit` (re-entrant calls are applied after the current hit resolves; the extra
   * damage does not re-trigger `onHeroHit`).
   */
  damage(target: number, amount: number, type: DamageType, source: number, crit?: boolean): void;
  heal(target: number, amount: number): void;
  /**
   * Use `attacker`'s weapon columns on `target` if it is in range and the weapon is ready.
   * Melee hits instantly; ranged fires projectile(s). Returns true when an attack happened.
   */
  attack(attacker: number, target: number): boolean;
  /** Fire `attacker`'s projectile(s) toward a point regardless of range/cooldown. */
  fire(attacker: number, tx: number, ty: number): void;
  /** Nearest live enemy whose edge is within `range` of (x, y), or -1. */
  nearestEnemy(x: number, y: number, range: number): number;
  /** Nearest live, targetable player-side entity (hero, ally, structure, core) within range, or -1. */
  nearestPlayerSide(x: number, y: number, range: number, includeStructures?: boolean): number;
  /** Start a ground telegraph; damage lands on player-side entities inside it at impact. */
  telegraph(spec: TelegraphSpec): number;
  /** Set a flammable structure on fire (no-op + `resist` event if it is not flammable). */
  ignite(target: number): void;
  /**
   * Set an enemy burning for at least `seconds` (refreshes, never shortens). Burning enemies take
   * world `rules.burnDps` fire damage per second (ignores armor), processed once per tick by the
   * sim. Emits `burn` ignite/end events. Flying enemies burn too; filter them in the caller if needed.
   */
  igniteEnemy(target: number, seconds: number): void;
  isBurning(target: number): boolean;
  /**
   * Switch a boss to a named stance from bosses.json `stances` (or `null` for none). The sim
   * recomputes armor / speed / damage from enemy def × phase × stance × enrage. Scripts must use
   * this instead of writing the armor/speed/wDamage columns.
   */
  bossStance(boss: BossRuntime, stance: string | null): void;
  /** Spawn an enemy by content id (used by summoner behaviours and boss scripts). */
  spawnEnemy(enemyId: string, x: number, y: number): number;
  /** Damage multiplier an attacker of this kind gets from cards and the difficulty limiter. */
  outgoingMult(attacker: number): number;
}

/** Hook the run installs so damage() can resolve deaths without a circular import. */
export interface CtxHooks {
  onDeath(run: Run, ctx: Ctx, e: number, source: number): void;
  onHeroHit(run: Run, ctx: Ctx, attacker: number, target: number, amount: number): void;
  onMeleeHit(run: Run, ctx: Ctx, attacker: number, target: number): void;
  spawnEnemy(run: Run, enemyIdx: number, x: number, y: number): number;
  addTelegraph(run: Run, spec: TelegraphSpec): number;
  applyBossStats(run: Run, boss: BossRuntime): void;
}

export function createCtx(run: Run, hooks: CtxHooks): Ctx {
  const w = run.w;
  const scratch = run.scratch;
  // Re-entrancy guard for damage(): nested calls (from hooks) are queued and drained in order.
  let depth = 0;
  const pending: { t: number; a: number; type: DamageType; s: number; crit: boolean }[] = [];

  /** Apply one hit. `hookable` = may fire onHeroHit (false for damage queued by hooks). */
  const applyHit = (target: number, amount: number, type: DamageType, source: number, crit: boolean, hookable: boolean): void => {
    if (!w.isAlive(target) || amount <= 0) return;
    const k = w.kind[target];
    if (k === Kind.Pickup || k === Kind.Projectile) return;
    if (w.flags[target] & Flag.Down) return;
    if (w.hp[target] <= 0) return; // already dying this call chain
    let dmg = amount;
    if (type === DamageType.Physical) dmg *= 1 - w.armor[target];
    if (k === Kind.Hero) {
      dmg *= run.mods.damageTakenMult;
      if (run.debugInvulnerable) dmg = 0;
      run.heroDamageThisWave += dmg;
    }
    if (k === Kind.Core && run.debugInvulnerable) dmg = 0;
    w.hp[target] -= dmg;
    ctx.emit({ type: 'hit', e: target, uid: w.uid[target], kind: k as Kind, amount: dmg, crit, source, x: w.x[target], y: w.y[target] });
    if (hookable && source >= 0 && w.kind[source] === Kind.Hero && k === Kind.Enemy) hooks.onHeroHit(run, ctx, source, target, dmg);
    if (w.hp[target] <= 0 && w.kind[target] === k) hooks.onDeath(run, ctx, target, source);
  };

  const ctx: Ctx = {
    run,
    w,
    rng: run.rng,
    emit(ev) {
      run.events.push(ev);
    },

    damage(target, amount, type, source, crit = false) {
      if (depth > 0) {
        pending.push({ t: target, a: amount, type, s: source, crit });
        return;
      }
      depth++;
      try {
        applyHit(target, amount, type, source, crit, true);
        // Damage queued by hooks: applied in order, never re-triggers onHeroHit (no feedback loops).
        for (let i = 0; i < pending.length; i++) {
          const p = pending[i];
          applyHit(p.t, p.a, p.type, p.s, p.crit, false);
        }
      } finally {
        pending.length = 0;
        depth--;
      }
    },

    heal(target, amount) {
      if (!w.isAlive(target)) return;
      w.hp[target] = Math.min(w.maxHp[target], w.hp[target] + amount);
    },

    outgoingMult(attacker) {
      const k = w.kind[attacker];
      if (k === Kind.Hero) return run.mods.damageMult * run.powerMult * w.buff[attacker];
      if (k === Kind.Ally) return run.mods.allyDamageMult * run.powerMult * w.buff[attacker];
      if (k === Kind.Structure) return run.mods.structureDamageMult * run.powerMult;
      return w.buff[attacker];
    },

    attack(attacker, target) {
      if (w.atkT[attacker] > 0 || !w.isAlive(target)) return false;
      const dx = w.x[target] - w.x[attacker];
      const dy = w.y[target] - w.y[attacker];
      const reach = w.wRange[attacker] + w.radius[attacker] + w.radius[target];
      if (dx * dx + dy * dy > reach * reach) return false;
      w.atkT[attacker] = w.wCooldown[attacker];
      if (w.wProjSpeed[attacker] <= 0) {
        let dmg = w.wDamage[attacker] * ctx.outgoingMult(attacker);
        let crit = false;
        if (w.kind[attacker] === Kind.Hero && run.mods.critChance > 0 && run.rng.chance(run.mods.critChance)) {
          dmg *= run.mods.critMult;
          crit = true;
        }
        ctx.damage(target, dmg, w.wType[attacker] as DamageType, attacker, crit);
        if (w.isAlive(attacker)) hooks.onMeleeHit(run, ctx, attacker, target);
      } else {
        ctx.fire(attacker, w.x[target], w.y[target]);
      }
      return true;
    },

    fire(attacker, tx, ty) {
      let dx = tx - w.x[attacker];
      let dy = ty - w.y[attacker];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) { dx = w.fx[attacker]; dy = w.fy[attacker]; } else { dx /= len; dy /= len; }
      w.fx[attacker] = dx; w.fy[attacker] = dy;
      const count = w.wCount[attacker];
      const speed = w.wProjSpeed[attacker];
      const life = (w.wRange[attacker] + w.radius[attacker] + 40) / speed;
      // Fan: rotate by ±12° steps around the aim direction, alternating sides.
      let lx = dx, ly = dy, rx = dx, ry = dy;
      for (let n = 0; n < count; n++) {
        let ax: number, ay: number;
        if (n === 0) { ax = dx; ay = dy; }
        else if (n % 2 === 1) {
          const nx = lx * FAN_COS - ly * FAN_SIN; const ny = lx * FAN_SIN + ly * FAN_COS;
          lx = nx; ly = ny; ax = lx; ay = ly;
        } else {
          const nx = rx * FAN_COS + ry * FAN_SIN; const ny = -rx * FAN_SIN + ry * FAN_COS;
          rx = nx; ry = ny; ax = rx; ay = ry;
        }
        const p = w.alloc(Kind.Projectile, w.x[attacker] + ax * w.radius[attacker], w.y[attacker] + ay * w.radius[attacker]);
        if (p < 0) return;
        w.team[p] = w.team[attacker];
        w.vx[p] = ax * speed; w.vy[p] = ay * speed;
        w.fx[p] = ax; w.fy[p] = ay;
        w.radius[p] = w.wProjRadius[attacker];
        w.wDamage[p] = w.wDamage[attacker] * ctx.outgoingMult(attacker);
        w.wType[p] = w.wType[attacker];
        w.value[p] = w.wPierce[attacker];
        w.life[p] = life;
        w.owner[p] = attacker;
        // Projectiles store the shooter kind in def so the renderer can colour them.
        w.def[p] = w.kind[attacker];
        if (w.kind[attacker] === Kind.Hero && run.mods.critChance > 0 && run.rng.chance(run.mods.critChance)) {
          w.wDamage[p] *= run.mods.critMult;
          w.flags[p] |= Flag.Crit;
        }
      }
    },

    nearestEnemy(x, y, range) {
      const n = run.hash.query(x, y, range, scratch);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const e = scratch[i];
        if (w.kind[e] !== Kind.Enemy) continue;
        const dx = w.x[e] - x, dy = w.y[e] - y;
        const reach = range + w.radius[e];
        const d2 = dx * dx + dy * dy;
        if (d2 <= reach * reach && (d2 < bestD || (d2 === bestD && e < best))) { bestD = d2; best = e; }
      }
      return best;
    },

    nearestPlayerSide(x, y, range, includeStructures = true) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < run.playerSideCount; i++) {
        const e = run.playerSide[i];
        if (!w.isAlive(e) || (w.flags[e] & Flag.Down)) continue;
        if (!includeStructures && w.kind[e] === Kind.Structure) continue;
        const dx = w.x[e] - x, dy = w.y[e] - y;
        const reach = range + w.radius[e];
        const d2 = dx * dx + dy * dy;
        if (d2 <= reach * reach && d2 < bestD) { bestD = d2; best = e; }
      }
      return best;
    },

    telegraph(spec) {
      return hooks.addTelegraph(run, spec);
    },

    ignite(target) {
      if (!w.isAlive(target) || w.kind[target] !== Kind.Structure) return;
      if (!(w.flags[target] & Flag.Flammable)) {
        ctx.emit({ type: 'burn', e: target, uid: w.uid[target], kind: Kind.Structure, state: 'resist' });
        return;
      }
      if (w.burnT[target] <= 0) ctx.emit({ type: 'burn', e: target, uid: w.uid[target], kind: Kind.Structure, state: 'ignite' });
      w.burnT[target] = run.worldDef.rules.burnSeconds;
    },

    igniteEnemy(target, seconds) {
      if (!w.isAlive(target) || w.kind[target] !== Kind.Enemy || seconds <= 0) return;
      if (w.burnT[target] <= 0) ctx.emit({ type: 'burn', e: target, uid: w.uid[target], kind: Kind.Enemy, state: 'ignite' });
      if (seconds > w.burnT[target]) w.burnT[target] = seconds;
      w.flags[target] |= Flag.Fire;
    },

    isBurning(target) {
      return w.isAlive(target) && w.burnT[target] > 0;
    },

    bossStance(boss, stance) {
      const name = stance ?? '';
      if (name && !(name in run.idx.bosses[boss.def].stances)) {
        throw new Error(`bossStance: boss "${run.idx.bosses[boss.def].id}" has no stance "${name}"`);
      }
      if (boss.stance === name) return;
      boss.stance = name;
      hooks.applyBossStats(run, boss);
    },

    spawnEnemy(enemyId, x, y) {
      const idx = run.idx.enemyIdx.get(enemyId);
      if (idx === undefined) throw new Error(`spawnEnemy: unknown enemy "${enemyId}"`);
      return hooks.spawnEnemy(run, idx, x, y);
    },
  };
  return ctx;
}

export { DamageType, Kind, PickupType, Team, Flag };
