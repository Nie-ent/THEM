/**
 * The simulation: run creation, the fixed-step pipeline and every built-in system.
 *
 * Step order (one call to `stepRun` = 1/30 s):
 *   commands → (frozen if paused / card draft open) → prep timer or wave spawner →
 *   rebuild spatial hash → reset buffs → hero input → enemy behaviours → enemy AI →
 *   allies (personalities) → structures (behaviours, burning) → hero auto-attack → bosses →
 *   card ticks → movement + collision → projectiles → telegraphs → pickups → regen →
 *   lose check → wave end → free-list flush.
 *
 * Determinism: entity loops run in ascending index; spatial queries return ids in a fixed order;
 * all randomness goes through the three Rng streams on the run; no trig, no wall clock.
 */
import type { ContentBundle, Side } from '@them/content';
import { DT, DamageType, Flag, INPUT_SCALE, Kind, PickupType, Team } from './constants';
import { createCtx, type Ctx, type CtxHooks } from './ctx';
import { str } from './params';
import { bossScripts, buildingBehaviors, cardEffects, enemyBehaviors, personalities } from './registry';
import { Rng } from './rng';
import { computeScore, powerMultiplier } from './scoring';
import { heroBaseStrength, limitLoadout, loadoutMods, type LimiterResult } from './power';
import { SpatialHash } from './spatial';
import {
  baseMods, type BossRuntime, type BuildGrid, type CardOption, type ContentIndex, type InputFrame, type Loadout, type Resolved,
  type Run, type RunConfig, type ScoreBreakdown, type SpawnEntry, type Telegraph, type TelegraphSpec, type WaveIntel,
} from './types';
import { World } from './world';

const ctxCache = new WeakMap<Run, Ctx>();

/* ------------------------------------------------------------------------------------------ */
/* Creation                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function indexContent(content: ContentBundle): ContentIndex {
  const mk = <T extends { id: string }>(arr: T[], what: string) => {
    const m = new Map<string, number>();
    arr.forEach((v, i) => {
      if (m.has(v.id)) throw new Error(`content: duplicate ${what} id "${v.id}"`);
      m.set(v.id, i);
    });
    return m;
  };
  return {
    enemies: content.enemies, buildings: content.buildings, heroes: content.heroes, cards: content.cards, bosses: content.bosses,
    enemyIdx: mk(content.enemies, 'enemy'), buildingIdx: mk(content.buildings, 'building'), heroIdx: mk(content.heroes, 'hero'),
    cardIdx: mk(content.cards, 'card'), bossIdx: mk(content.bosses, 'boss'),
  };
}

function resolve(content: ContentBundle, idx: ContentIndex): Resolved {
  for (const world of content.worlds) {
    world.waves.forEach((wave, wi) => {
      for (const g of wave.groups) {
        if (!idx.enemyIdx.has(g.enemy)) throw new Error(`world ${world.id} wave ${wi + 1}: unknown enemy "${g.enemy}"`);
      }
    });
  }
  for (const e of content.enemies) {
    if (e.boss && !idx.bossIdx.has(e.boss)) throw new Error(`enemy ${e.id}: unknown boss "${e.boss}"`);
  }
  return {
    enemyBehaviors: content.enemies.map((e) => e.behaviors.map((b) => ({ b: enemyBehaviors.get(b.id), params: b.params }))),
    buildingBehaviors: content.buildings.map((b) => buildingBehaviors.get(b.behavior)),
    personalities: content.heroes.map((h) => personalities.get(h.personality)),
    bossScripts: content.bosses.map((b) => bossScripts.get(b.script)),
    cardEffects: content.cards.map((c) => cardEffects.get(c.effect)),
  };
}

function makeGrid(run: { worldDef: ContentBundle['worlds'][number] }, cx: number, cy: number): BuildGrid {
  const g = run.worldDef.buildGrid;
  const buildable = new Uint8Array(g.cols * g.rows);
  for (let r = 0; r < g.rows; r++) {
    const row = g.mask[r] ?? '';
    for (let c = 0; c < g.cols; c++) buildable[r * g.cols + c] = row[c] === '.' ? 1 : 0;
  }
  return {
    cols: g.cols, rows: g.rows, cellSize: g.cellSize,
    originX: cx - (g.cols * g.cellSize) / 2, originY: cy - (g.rows * g.cellSize) / 2,
    buildable, cell: new Int32Array(g.cols * g.rows).fill(-1), cellDef: new Int16Array(g.cols * g.rows).fill(-1),
    maxSlots: g.maxSlots, slotsUsed: 0,
  };
}

function setWeapon(w: World, e: number, wp: ContentBundle['balance']['playerHero']['weapon']): void {
  w.wDamage[e] = wp.damage; w.wCooldown[e] = wp.cooldown; w.wRange[e] = wp.range;
  w.wProjSpeed[e] = wp.projectileSpeed; w.wProjRadius[e] = wp.projectileRadius;
  w.wPierce[e] = wp.pierce; w.wCount[e] = wp.count; w.wType[e] = wp.damageType === 'fire' ? DamageType.Fire : DamageType.Physical;
}

/**
 * Apply the loadout's card changes to a copy of the card list (content itself is never mutated):
 * `cardParams` adds to numeric params (every entry of a per-level table), `cardWeights` multiplies
 * the draft weight. Keys are applied in sorted order. Throws on unknown cards / non-numeric params.
 * `scale` is the difficulty limiter's loadout scale (src/power.ts): param deltas shrink with it.
 */
function patchCards(content: ContentBundle, lo: Loadout, scale: number): ContentBundle {
  const cp = lo.cardParams ?? {}, cw = lo.cardWeights ?? {};
  if (Object.keys(cp).length === 0 && Object.keys(cw).length === 0) return content;
  const cards = content.cards.map((c) => ({ ...c, params: { ...c.params } }));
  const find = (id: string) => {
    const c = cards.find((x) => x.id === id);
    if (!c) throw new Error(`createRun: loadout references unknown card "${id}"`);
    return c;
  };
  const finite = (v: unknown, what: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`createRun: ${what} is not a finite number`);
    return v;
  };
  for (const id of Object.keys(cp).sort()) {
    const c = find(id);
    for (const key of Object.keys(cp[id]!).sort()) {
      const d = finite(cp[id]![key], `loadout cardParams.${id}.${key}`) * scale;
      const v = c.params[key];
      if (typeof v === 'number') c.params[key] = v + d;
      else if (Array.isArray(v)) c.params[key] = v.map((x) => x + d);
      else throw new Error(`createRun: card "${id}" has no numeric param "${key}"`);
    }
  }
  for (const id of Object.keys(cw).sort()) {
    const m = finite(cw[id], `loadout cardWeights.${id}`);
    if (m < 0) throw new Error(`createRun: loadout cardWeights.${id} is negative`);
    const c = find(id);
    c.weight *= m;
  }
  return { ...content, cards };
}

export function createRunImpl(config: RunConfig, baseContent: ContentBundle, seed: number): Run {
  const worldDef = baseContent.worlds.find((x) => x.id === config.worldId);
  if (!worldDef) throw new Error(`createRun: unknown world "${config.worldId}"`);
  const lo = config.loadout;
  const full: Required<RunConfig> = {
    worldId: config.worldId,
    difficulty: config.difficulty ?? 'normal',
    hardcoreRules: config.hardcoreRules ?? 0,
    power: config.power ?? 0, // replaced below by the derived power
    allyHeroes: config.allyHeroes ?? baseContent.heroes.filter((h) => h.defaultTeam).map((h) => h.id),
    loadout: {
      mods: { ...lo?.mods },
      ...(lo?.cardParams ? { cardParams: Object.fromEntries(Object.entries(lo.cardParams).map(([k, v]) => [k, { ...v }])) } : {}),
      ...(lo?.cardWeights ? { cardWeights: { ...lo.cardWeights } } : {}),
      ...(lo?.unlockCards ? { unlockCards: [...lo.unlockCards].sort() } : {}),
      ...(lo?.allyMods ? { allyMods: Object.fromEntries(Object.entries(lo.allyMods).map(([k, v]) => [k, { ...v }])) } : {}),
    },
  };
  for (const [id, m] of Object.entries(full.loadout.allyMods ?? {})) {
    if (!baseContent.heroes.some((h) => h.id === id)) throw new Error(`createRun: allyMods for unknown hero "${id}"`);
    for (const [k, v] of Object.entries(m)) {
      if (k !== 'hpMult' && k !== 'damageMult') throw new Error(`createRun: allyMods.${id} has unknown key "${k}"`);
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= -1) throw new Error(`createRun: allyMods.${id}.${k} must be a finite number > -1`);
    }
  }
  const known = baseMods();
  for (const [k, v] of Object.entries(full.loadout.mods ?? {})) {
    if (!(k in known)) throw new Error(`createRun: unknown loadout mod "${k}"`);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`createRun: loadout mod "${k}" is not a finite number`);
  }
  for (const id of full.loadout.unlockCards ?? []) {
    const c = baseContent.cards.find((x) => x.id === id);
    if (!c) throw new Error(`createRun: loadout unlocks unknown card "${id}"`);
    if (!c.exclusive) throw new Error(`createRun: loadout unlocks card "${id}", which is not exclusive`);
  }
  // Difficulty limiter (src/power.ts): power comes from the loadout unless explicitly given for a
  // bare run. Above recommended the loadout's effects are scaled down; powerMult only serves the
  // explicit bare-run path, so the two never stack.
  const hasEffects = Object.values(full.loadout.mods ?? {}).some((v) => v !== 0) || Object.keys(full.loadout.allyMods ?? {}).length > 0;
  if (config.power !== undefined && hasEffects) throw new Error('createRun: pass either `power` or a loadout with modifiers, not both');
  const cap = baseContent.balance.difficultyLimiter.cap;
  const recommended = worldDef.recommendedPower;
  let limiter: LimiterResult;
  let powerMult = 1;
  if (config.power !== undefined) {
    if (!Number.isFinite(config.power) || config.power < 0) throw new Error('createRun: power must be a finite number >= 0');
    const active = config.power > recommended;
    powerMult = active ? powerMultiplier(config.power, recommended, cap) : 1;
    limiter = { power: config.power, recommended, effectivePower: active ? recommended * powerMult : config.power, scale: 1, allyFactor: 1, active };
  } else {
    const ph = baseContent.balance.playerHero;
    const strength = (id: string) => {
      const h = baseContent.heroes.find((x) => x.id === id);
      return h ? heroBaseStrength(h.hp, h.weapon) : 0;
    };
    const referenceTeam = baseContent.heroes.filter((h) => h.defaultTeam).reduce((a, h) => a + heroBaseStrength(h.hp, h.weapon), 0);
    const referenceCount = baseContent.heroes.filter((h) => h.defaultTeam).length;
    limiter = limitLoadout(full.loadout, {
      heroHp: ph.hp, heroArmor: ph.armor, referenceTeam, referenceCount,
      allies: full.allyHeroes.map((id) => ({ id, base: strength(id) })),
    }, recommended, cap);
  }
  full.power = limiter.power;
  // Card changes from the loadout live in the run's own copy of content.
  const content = patchCards(baseContent, full.loadout, limiter.scale);
  const idx = indexContent(content);
  const res = resolve(content, idx);
  for (const h of full.allyHeroes) if (!idx.heroIdx.has(h)) throw new Error(`createRun: unknown ally hero "${h}"`);

  const w = new World();
  const root = new Rng(seed);
  const { width, height } = worldDef.arena;
  const cx = width / 2, cy = height / 2;

  const run: Run = {
    config: full, content, worldDef, balance: content.balance, idx, res, seed: seed >>> 0,
    w, hash: new SpatialHash(width, height, 64, w.capacity),
    rng: root.fork(1), spawnRng: root.fork(2), cardRng: root.fork(3),
    tick: 0, activeTicks: 0, phase: 'prep', result: null, paused: false,
    waveIndex: 0, prepTimer: worldDef.prepSeconds, waveTime: 0, spawnQueue: [], spawnCursor: 0, waveAlive: 0,
    hero: -1, core: -1, allies: [], allyDefs: [],
    wood: worldDef.startingResources.wood, stone: worldDef.startingResources.stone,
    grid: undefined as unknown as BuildGrid,
    level: 1, xp: 0, pendingLevels: 0, draft: null, rerollsLeft: content.balance.rerollsPerRun,
    cards: [], mods: baseMods(), cardState: {},
    powerMult, limiter,
    bosses: [], telegraphs: [], nextTelegraphId: 1,
    kills: { normal: 0, elite: 0, miniboss: 0, boss: 0 }, bossKilled: false,
    heroDamageThisWave: 0, heroDamageFracSum: 0, wavesScored: 0,
    debugInvulnerable: false,
    events: [],
    scratch: new Int32Array(1024), scratch2: new Int32Array(1024),
    playerSide: new Int32Array(1024), playerSideCount: 0,
  };
  run.grid = makeGrid(run, cx, cy);

  // Core
  const core = w.alloc(Kind.Core, cx, cy);
  w.team[core] = Team.Player;
  w.radius[core] = worldDef.core.radius;
  w.hp[core] = w.maxHp[core] = worldDef.core.hp;
  w.flags[core] = Flag.Blocking;
  run.core = core;

  // Hero
  const ph = content.balance.playerHero;
  const hero = w.alloc(Kind.Hero, cx, cy + worldDef.core.radius + 60);
  w.team[hero] = Team.Player;
  w.radius[hero] = ph.radius;
  w.speed[hero] = ph.speed;
  w.hp[hero] = w.maxHp[hero] = ph.hp;
  w.armor[hero] = ph.armor;
  setWeapon(w, hero, ph.weapon);
  w.fx[hero] = 0; w.fy[hero] = -1;
  run.hero = hero;

  // AI heroes, posted around the Core
  full.allyHeroes.forEach((id, k) => {
    const di = idx.heroIdx.get(id)!;
    const d = content.heroes[di];
    const ox = k % 2 === 0 ? -1 : 1;
    const a = w.alloc(Kind.Ally, cx + ox * (worldDef.core.radius + 80), cy - 40 * Math.floor(k / 2));
    w.team[a] = Team.Player;
    w.def[a] = di;
    w.radius[a] = d.radius;
    w.speed[a] = d.speed;
    // Per-hero growth from meta (hero level and stars, P2-07): fractions on base HP and weapon damage.
    const am = full.loadout.allyMods?.[id];
    // Difficulty limiter: one factor on the whole AI team's strength (src/power.ts).
    const af = limiter.allyFactor;
    w.hp[a] = w.maxHp[a] = d.hp * (1 + (am?.hpMult ?? 0)) * af;
    setWeapon(w, a, d.weapon);
    w.wDamage[a] *= (1 + (am?.damageMult ?? 0)) * af;
    run.allies.push(a);
    run.allyDefs.push(di);
  });

  ctxCache.set(run, createCtx(run, hooks));
  applyMods(run);
  for (let i = 0; i < w.highWater; i++) {
    if (w.isAlive(i)) run.events.push({ type: 'spawn', e: i, uid: w.uid[i], kind: w.kind[i] as Kind, def: w.def[i] });
  }
  return run;
}

export function getCtx(run: Run): Ctx {
  const c = ctxCache.get(run);
  if (!c) throw new Error('run has no context');
  return c;
}

/* ------------------------------------------------------------------------------------------ */
/* Hooks the context calls back into                                                          */
/* ------------------------------------------------------------------------------------------ */

const hooks: CtxHooks = {
  onDeath: handleDeath,
  onHeroHit(run, ctx, _attacker, target, amount) {
    for (const c of run.cards) {
      const ci = run.idx.cardIdx.get(c.id)!;
      const eff = run.res.cardEffects[ci];
      if (eff.onHeroHit) eff.onHeroHit(ctx, target, amount, c.level, run.idx.cards[ci].params);
    }
  },
  onMeleeHit(run, ctx, attacker, target) {
    if (run.w.kind[attacker] !== Kind.Enemy) return;
    for (const { b, params } of run.res.enemyBehaviors[run.w.def[attacker]]) if (b.onMeleeHit) b.onMeleeHit(ctx, attacker, target, params);
  },
  spawnEnemy: spawnEnemyAt,
  addTelegraph,
  applyBossStats,
};

/**
 * Boss stats are derived, never written by scripts:
 *   armor  = stance.armor ?? phase.armor ?? enemy.armor
 *   speed  = enemy.speed  × phase.speedMult  × stance.speedMult  × enrage
 *   damage = weapon.damage × phase.damageMult × stance.damageMult × enrage
 */
function applyBossStats(run: Run, b: BossRuntime): void {
  const w = run.w, e = b.e;
  if (!w.isAlive(e) || w.uid[e] !== b.uid) return;
  const bd = run.idx.bosses[b.def];
  const ed = run.idx.enemies[w.def[e]];
  const ph = bd.phases[b.phase];
  const st = b.stance ? bd.stances[b.stance] : undefined;
  w.armor[e] = st?.armor ?? ph.armor ?? ed.armor;
  w.speed[e] = ed.speed * (ph.speedMult ?? 1) * (st?.speedMult ?? 1) * (b.enraged ? bd.enrageSpeedMult : 1);
  w.wDamage[e] = ed.weapon.damage * (ph.damageMult ?? 1) * (st?.damageMult ?? 1) * (b.enraged ? bd.enrageDamageMult : 1);
}

function emitBossLine(run: Run, b: BossRuntime, moment: 'intro' | 'phase' | 'defeat', key: string): void {
  if (!key) return;
  run.events.push({ type: 'bossLine', e: b.e, bossId: run.idx.bosses[b.def].id, moment, phase: b.phase, key });
}

function spawnEnemyAt(run: Run, di: number, x: number, y: number): number {
  const w = run.w;
  const d = run.idx.enemies[di];
  const e = w.alloc(Kind.Enemy, x, y);
  if (e < 0) return -1;
  w.team[e] = Team.Enemy;
  w.def[e] = di;
  w.radius[e] = d.radius;
  w.speed[e] = d.speed;
  w.hp[e] = w.maxHp[e] = d.hp;
  w.armor[e] = d.armor;
  w.wave[e] = run.waveIndex + 1;
  setWeapon(w, e, d.weapon);
  let f = 0;
  if (d.flying) f |= Flag.Flying;
  if (d.ignoresAggro) f |= Flag.IgnoresAggro;
  if (d.weapon.projectileSpeed > 0) f |= Flag.Ranged;
  w.flags[e] = f;
  // Face the Core on spawn.
  const dx = w.x[run.core] - x, dy = w.y[run.core] - y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  w.fx[e] = dx / len; w.fy[e] = dy / len;
  run.waveAlive++;
  // Visible to area effects and targeting for the rest of this tick. Safe: the hash is rebuilt
  // from scratch each tick, ids released this tick are not reused until flushFree(), and every
  // query filters by kind/alive, so a late insert can never alias another entity.
  run.hash.insert(e, x, y, w.radius[e]);
  const ctx = getCtx(run);
  ctx.emit({ type: 'spawn', e, uid: w.uid[e], kind: Kind.Enemy, def: di });
  for (const { b, params } of run.res.enemyBehaviors[di]) if (b.onSpawn) b.onSpawn(ctx, e, params);
  if (d.boss) {
    w.flags[e] |= Flag.Boss;
    const bi = run.idx.bossIdx.get(d.boss)!;
    const boss: BossRuntime = { e, uid: w.uid[e], def: bi, phase: 0, t: 0, enraged: false, stance: '', state: {} };
    run.bosses.push(boss);
    const bd = run.idx.bosses[bi];
    const script = run.res.bossScripts[bi];
    applyBossStats(run, boss);
    emitBossLine(run, boss, 'intro', str(bd.params, 'introKey'));
    if (script.onSpawn) script.onSpawn(ctx, boss, bd.params);
  }
  return e;
}

function addTelegraph(run: Run, spec: TelegraphSpec): number {
  const id = run.nextTelegraphId++;
  const t: Telegraph = {
    id, t: 0, active: true,
    shape: spec.shape, x: spec.x, y: spec.y, r: spec.r, r2: spec.r2 ?? 0,
    dx: spec.dx ?? 1, dy: spec.dy ?? 0, windup: Math.max(0.7, spec.windup), damage: spec.damage,
    targetsCore: spec.targetsCore ?? false, owner: spec.owner ?? -1,
  };
  run.telegraphs.push(t);
  run.events.push({ type: 'telegraph', id, state: 'start', targetsCore: t.targetsCore });
  return id;
}

function handleDeath(run: Run, ctx: Ctx, e: number, source: number): void {
  const w = run.w;
  const k = w.kind[e];
  const x = w.x[e], y = w.y[e];
  if (k === Kind.Enemy) {
    const di = w.def[e];
    const d = run.idx.enemies[di];
    run.kills[d.tier]++;
    if (d.tier === 'boss') run.bossKilled = true;
    ctx.emit({ type: 'death', e, uid: w.uid[e], kind: Kind.Enemy, def: di, x, y });
    for (const { b, params } of run.res.enemyBehaviors[di]) if (b.onDeath) b.onDeath(ctx, e, params);
    if (w.wave[e] === run.waveIndex + 1) run.waveAlive--;
    // drops
    if (d.xp > 0) spawnPickup(run, PickupType.Xp, x, y, d.xp * run.mods.xpMult);
    if ((d.drops.wood > 0 || d.drops.stone > 0) && run.rng.chance(d.drops.chance)) {
      if (d.drops.wood > 0) spawnPickup(run, PickupType.Wood, x + 6, y, d.drops.wood);
      if (d.drops.stone > 0) spawnPickup(run, PickupType.Stone, x - 6, y, d.drops.stone);
    }
    if (source >= 0 && w.team[source] === Team.Player) {
      for (const c of run.cards) {
        const ci = run.idx.cardIdx.get(c.id)!;
        const eff = run.res.cardEffects[ci];
        if (eff.onKill) eff.onKill(ctx, e, c.level, run.idx.cards[ci].params);
      }
    }
    if (w.flags[e] & Flag.Boss) {
      const bi = run.bosses.findIndex((b) => b.e === e);
      if (bi >= 0) {
        const b = run.bosses[bi];
        emitBossLine(run, b, 'defeat', str(run.idx.bosses[b.def].params, 'defeatKey'));
        run.bosses.splice(bi, 1);
      }
      for (const t of run.telegraphs) if (t.owner === e) t.active = false;
    }
    w.release(e);
  } else if (k === Kind.Structure) {
    const cell = cellAt(run.grid, w.hx[e], w.hy[e]);
    if (cell >= 0 && run.grid.cell[cell] === e) {
      run.grid.cell[cell] = -1;
      run.grid.cellDef[cell] = -1;
      run.grid.slotsUsed--;
    }
    ctx.emit({ type: 'death', e, uid: w.uid[e], kind: Kind.Structure, def: w.def[e], x, y });
    w.release(e);
  } else if (k === Kind.Ally) {
    w.hp[e] = 0;
    w.flags[e] |= Flag.Down;
    w.vx[e] = 0; w.vy[e] = 0;
    ctx.emit({ type: 'death', e, uid: w.uid[e], kind: Kind.Ally, def: w.def[e], x, y });
  } else if (k === Kind.Hero || k === Kind.Core) {
    w.hp[e] = 0;
    ctx.emit({ type: 'death', e, uid: w.uid[e], kind: k, def: 0, x, y });
    endRun(run, 'lose');
  }
}

function spawnPickup(run: Run, type: PickupType, x: number, y: number, value: number): void {
  const w = run.w;
  const p = w.alloc(Kind.Pickup, x, y);
  if (p < 0) return;
  w.def[p] = type;
  w.value[p] = value;
  w.radius[p] = type === PickupType.Xp ? 3 : 4;
}

/* ------------------------------------------------------------------------------------------ */
/* Modifiers / cards                                                                          */
/* ------------------------------------------------------------------------------------------ */

export function applyMods(run: Run): void {
  // Meta loadout first (sorted keys; scaled by the difficulty limiter), then cards.
  const m = loadoutMods(run.config.loadout, run.limiter.scale);
  for (const c of run.cards) {
    const ci = run.idx.cardIdx.get(c.id)!;
    const eff = run.res.cardEffects[ci];
    if (eff.apply) eff.apply(m, c.level, run.idx.cards[ci].params);
  }
  run.mods = m;
  const w = run.w, h = run.hero, ph = run.balance.playerHero;
  const frac = w.maxHp[h] > 0 ? w.hp[h] / w.maxHp[h] : 1;
  w.maxHp[h] = ph.hp * m.maxHpMult;
  w.hp[h] = Math.min(w.maxHp[h], Math.max(1, frac * w.maxHp[h]));
  w.speed[h] = ph.speed * m.speedMult;
  w.armor[h] = Math.min(0.9, Math.max(0, ph.armor + m.armorAdd));
  w.wCooldown[h] = Math.max(0.05, ph.weapon.cooldown * m.cooldownMult);
  w.wRange[h] = ph.weapon.range * m.rangeMult;
  w.wProjSpeed[h] = ph.weapon.projectileSpeed * m.projectileSpeedMult;
  w.wCount[h] = Math.max(1, Math.min(255, ph.weapon.count + m.projectileCountAdd));
  w.wPierce[h] = Math.max(0, Math.min(255, ph.weapon.pierce + m.pierceAdd));
}

function xpToNext(run: Run): number {
  const t = run.balance.xpTable;
  return t[Math.min(run.level, t.length) - 1];
}

function rollOffer(run: Run): CardOption[] {
  const cards = run.idx.cards;
  const owned = new Map(run.cards.map((c) => [c.id, c.level]));
  const unlocked = run.config.loadout.unlockCards;
  const weights = cards.map((c) => ((owned.get(c.id) ?? 0) >= c.maxLevel || (c.exclusive && !unlocked?.includes(c.id)) ? 0 : c.weight));
  const out: CardOption[] = [];
  for (let n = 0; n < run.balance.cardChoices; n++) {
    const i = run.cardRng.weighted(weights);
    if (i < 0) break;
    weights[i] = 0;
    out.push({ cardId: cards[i].id, nextLevel: (owned.get(cards[i].id) ?? 0) + 1 });
  }
  return out;
}

function openDraftIfNeeded(run: Run): void {
  while (run.draft === null && run.pendingLevels > 0) {
    const offer = rollOffer(run);
    if (offer.length === 0) { run.pendingLevels = 0; return; }
    run.draft = offer;
    run.events.push({ type: 'cardOffer', options: offer, rerollsLeft: run.rerollsLeft });
  }
}

function pickCard(run: Run, index: number): void {
  const offer = run.draft;
  const opt = offer?.[index];
  if (!opt) { run.events.push({ type: 'rejected', command: 'pickCard', reason: 'noOffer' }); return; }
  const existing = run.cards.find((c) => c.id === opt.cardId);
  if (existing) existing.level++;
  else run.cards.push({ id: opt.cardId, level: 1 });
  const level = existing ? existing.level : 1;
  run.draft = null;
  run.pendingLevels--;
  applyMods(run);
  const ci = run.idx.cardIdx.get(opt.cardId)!;
  const eff = run.res.cardEffects[ci];
  if (eff.onPick) eff.onPick(getCtx(run), level, run.idx.cards[ci].params);
  run.events.push({ type: 'cardPicked', cardId: opt.cardId, level });
  openDraftIfNeeded(run);
}

function reroll(run: Run): void {
  if (!run.draft || run.rerollsLeft <= 0) { run.events.push({ type: 'rejected', command: 'reroll', reason: run.draft ? 'noRerolls' : 'noOffer' }); return; }
  run.rerollsLeft--;
  run.draft = null;
  openDraftIfNeeded(run);
}

function gainXp(run: Run, amount: number): void {
  run.xp += amount;
  let need = xpToNext(run);
  while (run.xp >= need) {
    run.xp -= need;
    run.level++;
    run.pendingLevels++;
    run.events.push({ type: 'levelUp', level: run.level });
    need = xpToNext(run);
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Build commands                                                                             */
/* ------------------------------------------------------------------------------------------ */

export function cellCenter(grid: BuildGrid, cell: number): { x: number; y: number } {
  const c = cell % grid.cols, r = Math.floor(cell / grid.cols);
  return { x: grid.originX + (c + 0.5) * grid.cellSize, y: grid.originY + (r + 0.5) * grid.cellSize };
}

export function cellAt(grid: BuildGrid, x: number, y: number): number {
  const c = Math.floor((x - grid.originX) / grid.cellSize), r = Math.floor((y - grid.originY) / grid.cellSize);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + c;
}

function build(run: Run, buildingId: string, cell: number): void {
  const reject = (reason: string): void => { run.events.push({ type: 'rejected', command: 'build', reason }); };
  if (run.phase !== 'prep') return reject('notPrep');
  const bi = run.idx.buildingIdx.get(buildingId);
  if (bi === undefined) return reject('unknownBuilding');
  const g = run.grid;
  if (!Number.isInteger(cell) || cell < 0 || cell >= g.cell.length || !g.buildable[cell]) return reject('notBuildable');
  if (g.cell[cell] !== -1) return reject('occupied');
  if (g.slotsUsed >= g.maxSlots) return reject('noSlots');
  const d = run.idx.buildings[bi];
  if (run.wood < d.cost.wood || run.stone < d.cost.stone) return reject('cost');
  const { x, y } = cellCenter(g, cell);
  const w = run.w;
  run.wood -= d.cost.wood;
  run.stone -= d.cost.stone;
  const e = w.alloc(Kind.Structure, x, y);
  if (e < 0) return reject('pool');
  w.team[e] = Team.Player;
  w.def[e] = bi;
  w.radius[e] = g.cellSize / 2;
  w.hp[e] = w.maxHp[e] = d.hp;
  let f = 0;
  if (d.flammable) f |= Flag.Flammable;
  if (d.blocking) f |= Flag.Blocking;
  w.flags[e] = f;
  g.cell[cell] = e;
  g.cellDef[cell] = bi;
  g.slotsUsed++;
  const ctx = getCtx(run);
  const beh = run.res.buildingBehaviors[bi];
  if (beh.onPlace) beh.onPlace(ctx, e, d.params);
  ctx.emit({ type: 'spawn', e, uid: w.uid[e], kind: Kind.Structure, def: bi });
  ctx.emit({ type: 'buildingPlaced', cell, buildingId, e });
}

function sell(run: Run, cell: number): void {
  const g = run.grid;
  if (run.phase !== 'prep') { run.events.push({ type: 'rejected', command: 'sell', reason: 'notPrep' }); return; }
  const e = g.cell[cell] ?? -1;
  if (e < 0) { run.events.push({ type: 'rejected', command: 'sell', reason: 'empty' }); return; }
  const d = run.idx.buildings[g.cellDef[cell]];
  const w = run.w;
  const k = run.balance.sellRefund * (w.hp[e] / w.maxHp[e]);
  const rw = Math.floor(d.cost.wood * k), rs = Math.floor(d.cost.stone * k);
  run.wood += rw;
  run.stone += rs;
  g.cell[cell] = -1;
  g.cellDef[cell] = -1;
  g.slotsUsed--;
  run.events.push({ type: 'buildingSold', cell, buildingId: d.id, refundWood: rw, refundStone: rs });
  run.events.push({ type: 'death', e, uid: w.uid[e], kind: Kind.Structure, def: w.def[e], x: w.x[e], y: w.y[e] });
  w.release(e);
}

/* ------------------------------------------------------------------------------------------ */
/* Waves                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const intelCache = new WeakMap<Run, Map<number, WaveIntel>>();

export function waveIntel(run: Run, waveIndex: number): WaveIntel | null {
  const wave = run.worldDef.waves[waveIndex];
  if (!wave) return null;
  let cache = intelCache.get(run);
  if (!cache) { cache = new Map(); intelCache.set(run, cache); }
  const hit = cache.get(waveIndex);
  if (hit) return hit;
  const counts = new Map<string, number>();
  const sides: Record<Side, number> = { N: 0, E: 0, S: 0, W: 0 };
  let total = 0;
  for (const g of wave.groups) {
    counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count);
    sides[g.side] += g.count;
    total += g.count;
  }
  for (const s of ['N', 'E', 'S', 'W'] as const) sides[s] = total > 0 ? sides[s] / total : 0;
  const intel: WaveIntel = {
    wave: waveIndex + 1, kind: wave.kind,
    enemies: [...counts].map(([enemyId, count]) => ({ enemyId, count })), sides,
  };
  cache.set(waveIndex, intel);
  return intel;
}

function startWave(run: Run): void {
  const wave = run.worldDef.waves[run.waveIndex];
  const q: SpawnEntry[] = [];
  for (const g of wave.groups) {
    const di = run.idx.enemyIdx.get(g.enemy)!;
    for (let k = 0; k < g.count; k++) q.push({ at: g.delay + k * g.interval, enemy: di, side: g.side });
  }
  q.sort((a, b) => a.at - b.at); // Array#sort is stable: ties keep group order.
  run.spawnQueue = q;
  run.spawnCursor = 0;
  run.waveAlive = 0;
  run.waveTime = 0;
  run.heroDamageThisWave = 0;
  run.phase = 'wave';
  run.events.push({ type: 'waveStart', wave: run.waveIndex + 1 });
}

function spawnPoint(run: Run, side: Side): { x: number; y: number } {
  const { width, height } = run.worldDef.arena;
  const m = 12;
  const t = run.spawnRng.range(0.15, 0.85);
  switch (side) {
    case 'N': return { x: width * t, y: m };
    case 'S': return { x: width * t, y: height - m };
    case 'W': return { x: m, y: height * t };
    case 'E': return { x: width - m, y: height * t };
  }
}

function endWave(run: Run): void {
  const w = run.w;
  const waveNo = run.waveIndex + 1;
  const wave = run.worldDef.waves[run.waveIndex];
  run.heroDamageFracSum += Math.min(1, run.heroDamageThisWave / Math.max(1, w.maxHp[run.hero]));
  run.wavesScored++;
  run.events.push({ type: 'waveEnd', wave: waveNo });
  // Vacuum every pickup on the field.
  for (let i = 0; i < w.highWater; i++) if (w.kind[i] === Kind.Pickup) collectPickup(run, i);
  // Any leftover projectiles / telegraphs vanish.
  for (let i = 0; i < w.highWater; i++) if (w.kind[i] === Kind.Projectile) w.release(i);
  run.telegraphs.length = 0;
  run.wood += wave.clearBonus.wood;
  run.stone += wave.clearBonus.stone;

  if (run.waveIndex + 1 >= run.worldDef.waves.length) {
    endRun(run, 'win');
    return;
  }
  payUpkeep(run);
  // Revive and re-post AI heroes.
  for (const a of run.allies) {
    w.flags[a] &= ~Flag.Down;
    w.hp[a] = w.maxHp[a];
    w.x[a] = w.hx[a]; w.y[a] = w.hy[a];
    w.vx[a] = 0; w.vy[a] = 0;
  }
  for (let i = 0; i < w.highWater; i++) if (w.kind[i] === Kind.Structure && w.burnT[i] > 0) {
    w.burnT[i] = 0;
    run.events.push({ type: 'burn', e: i, uid: w.uid[i], kind: Kind.Structure, state: 'end' });
  }
  run.waveIndex++;
  run.phase = 'prep';
  run.prepTimer = run.worldDef.prepSeconds;
  openDraftIfNeeded(run);
}

function payUpkeep(run: Run): void {
  const g = run.grid, w = run.w;
  let paidWood = 0, paidStone = 0, decayed = 0;
  for (let c = 0; c < g.cell.length; c++) {
    const e = g.cell[c];
    if (e < 0) continue;
    const up = run.idx.buildings[g.cellDef[c]].upkeep;
    if (run.wood >= up.wood && run.stone >= up.stone) {
      run.wood -= up.wood; run.stone -= up.stone;
      paidWood += up.wood; paidStone += up.stone;
    } else {
      decayed++;
      getCtx(run).damage(e, w.maxHp[e] * run.balance.upkeepDecay, DamageType.Fire, -1);
    }
  }
  run.events.push({ type: 'upkeep', paidWood, paidStone, decayed });
}

function endRun(run: Run, result: 'win' | 'lose'): void {
  if (run.phase === 'ended') return;
  if (result === 'lose') {
    // Count the partial wave toward the damage fraction.
    run.heroDamageFracSum += Math.min(1, run.heroDamageThisWave / Math.max(1, run.w.maxHp[run.hero]));
    run.wavesScored++;
  }
  run.phase = 'ended';
  run.result = result;
  run.draft = null;
  run.events.push({ type: 'runEnd', result, score: currentScore(run) });
}

export function currentScore(run: Run): ScoreBreakdown {
  const w = run.w;
  const waves = run.wavesScored;
  return computeScore(run.balance.scoring, {
    kills: run.kills,
    bossKilled: run.bossKilled,
    difficulty: run.config.difficulty,
    hardcoreRules: run.config.hardcoreRules,
    standardTime: run.worldDef.standardTimeSeconds,
    actualTime: run.activeTicks * DT,
    coreHpFrac: Math.max(0, w.hp[run.core]) / w.maxHp[run.core],
    heroDamageFrac: waves > 0 ? run.heroDamageFracSum / waves : 0,
    lost: run.result === 'lose',
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Step                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function stepRunImpl(run: Run, input: InputFrame): void {
  run.tick++;
  if (run.phase === 'ended') return;
  const w = run.w;

  if (input.pause) {
    run.paused = !run.paused;
    run.events.push({ type: 'paused', paused: run.paused });
  }
  if (run.paused) return;

  // Card draft freezes the world.
  if (run.draft) {
    if (input.reroll) reroll(run);
    else if (input.pickCard !== undefined) pickCard(run, input.pickCard);
    if (run.draft) return;
  } else if (input.pickCard !== undefined || input.reroll) {
    run.events.push({ type: 'rejected', command: input.reroll ? 'reroll' : 'pickCard', reason: 'noOffer' });
  }

  // Interpolation anchor.
  for (let i = 0; i < w.highWater; i++) { w.px[i] = w.x[i]; w.py[i] = w.y[i]; }
  run.activeTicks++;

  if (run.phase === 'prep') {
    if (input.build) build(run, input.build.buildingId, input.build.cell);
    if (input.sell !== undefined) sell(run, input.sell);
    if (input.placeHero) placeHero(run, input.placeHero.heroId, input.placeHero.x, input.placeHero.y);
    run.prepTimer -= DT;
    if (input.callWave || run.prepTimer <= 1e-9) startWave(run);
  } else {
    if (input.build || input.sell !== undefined || input.placeHero) {
      run.events.push({ type: 'rejected', command: input.build ? 'build' : input.sell !== undefined ? 'sell' : 'placeHero', reason: 'notPrep' });
    }
    if (input.callWave) run.events.push({ type: 'rejected', command: 'callWave', reason: 'notPrep' });
  }

  const ctx = getCtx(run);
  const inWave = run.phase === 'wave';

  if (inWave) {
    run.waveTime += DT;
    const q = run.spawnQueue;
    while (run.spawnCursor < q.length && q[run.spawnCursor].at <= run.waveTime + 1e-9) {
      const s = q[run.spawnCursor++];
      const p = spawnPoint(run, s.side);
      spawnEnemyAt(run, s.enemy, p.x, p.y);
    }
  }

  rebuildHash(run);
  rebuildPlayerSide(run);
  for (let i = 0; i < w.highWater; i++) { w.buff[i] = 1; w.speedBuff[i] = 1; }

  heroInput(run, input);
  if (inWave) {
    enemyBehaviorSystem(run, ctx);
    enemyAiSystem(run, ctx);
    allySystem(run, ctx);
    structureSystem(run, ctx);
    enemyBurnSystem(run, ctx);
    heroAttackSystem(run, ctx);
    bossSystem(run, ctx);
    cardTickSystem(run, ctx);
  }
  cooldownSystem(run);
  movementSystem(run);
  if (inWave) {
    rebuildHash(run);
    projectileSystem(run, ctx);
    telegraphSystem(run, ctx);
  }
  pickupSystem(run);
  regenSystem(run);

  if (run.phase === 'wave' && run.spawnCursor >= run.spawnQueue.length && run.waveAlive <= 0) endWave(run);
  openDraftIfNeeded(run);
  w.flushFree();
}

function placeHero(run: Run, heroId: string, x: number, y: number): void {
  const di = run.idx.heroIdx.get(heroId);
  const k = di === undefined ? -1 : run.allyDefs.indexOf(di);
  if (k < 0) { run.events.push({ type: 'rejected', command: 'placeHero', reason: 'unknownHero' }); return; }
  const a = run.allies[k];
  const { width, height } = run.worldDef.arena;
  const w = run.w;
  const r = w.radius[a];
  const cx = Math.min(width - r, Math.max(r, x)), cy = Math.min(height - r, Math.max(r, y));
  w.hx[a] = cx; w.hy[a] = cy; w.x[a] = cx; w.y[a] = cy; w.px[a] = cx; w.py[a] = cy;
}

/* ------------------------------------------------------------------------------------------ */
/* Systems                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function rebuildHash(run: Run): void {
  const w = run.w, h = run.hash;
  h.clear();
  for (let i = 0; i < w.highWater; i++) if (w.kind[i] === Kind.Enemy) h.insert(i, w.x[i], w.y[i], w.radius[i]);
}

function rebuildPlayerSide(run: Run): void {
  const w = run.w;
  let n = 0;
  const ps = run.playerSide;
  ps[n++] = run.hero;
  ps[n++] = run.core;
  for (const a of run.allies) if (!(w.flags[a] & Flag.Down)) ps[n++] = a;
  for (let i = 0; i < w.highWater && n < ps.length; i++) if (w.kind[i] === Kind.Structure) ps[n++] = i;
  run.playerSideCount = n;
}

function heroInput(run: Run, input: InputFrame): void {
  const w = run.w, h = run.hero;
  let mx = Math.max(-INPUT_SCALE, Math.min(INPUT_SCALE, Math.trunc(input.moveX))) / INPUT_SCALE;
  let my = Math.max(-INPUT_SCALE, Math.min(INPUT_SCALE, Math.trunc(input.moveY))) / INPUT_SCALE;
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 1) { mx /= len; my /= len; }
  w.vx[h] = mx * w.speed[h];
  w.vy[h] = my * w.speed[h];
  if (len > 0.01) { const l = len > 1 ? 1 : len; w.fx[h] = mx / l; w.fy[h] = my / l; }
}

function enemyBehaviorSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  const hw = w.highWater;
  for (let i = 0; i < hw; i++) {
    if (w.kind[i] !== Kind.Enemy) continue;
    const list = run.res.enemyBehaviors[w.def[i]];
    for (let k = 0; k < list.length; k++) {
      const { b, params } = list[k];
      if (b.tick) b.tick(ctx, i, params);
      if (w.kind[i] !== Kind.Enemy) break;
    }
  }
}

function chooseEnemyTarget(run: Run, e: number): number {
  const w = run.w;
  const d = run.idx.enemies[w.def[e]];
  // Blocked by a wall → chew through it (unless flying).
  const bl = w.blockedBy[e];
  if (bl >= 0 && w.kind[bl] === Kind.Structure) return bl;
  if (d.targeting === 'hero') return run.hero;
  const x = w.x[e], y = w.y[e];
  if (!(w.flags[e] & Flag.IgnoresAggro)) {
    // Aggro: hero or a standing ally inside aggroRadius pulls the enemy off its route.
    let best = -1, bestD = d.aggroRadius * d.aggroRadius;
    const h = run.hero;
    let dx = w.x[h] - x, dy = w.y[h] - y, d2 = dx * dx + dy * dy;
    if (d2 <= bestD) { best = h; bestD = d2; }
    for (const a of run.allies) {
      if (w.flags[a] & Flag.Down) continue;
      dx = w.x[a] - x; dy = w.y[a] - y; d2 = dx * dx + dy * dy;
      if (d2 < bestD) { best = a; bestD = d2; }
    }
    if (best >= 0) return best;
  }
  if (d.targeting === 'structure') {
    // Projectiles fly over non-blocking structures (traps), so ranged hunters must never pick one:
    // they could never damage it and the wave would never end (QA-P1-10-003).
    const ranged = (w.flags[e] & Flag.Ranged) !== 0;
    let best = -1, bestD = Infinity;
    for (let k = 2; k < run.playerSideCount; k++) {
      const s = run.playerSide[k];
      if (w.kind[s] !== Kind.Structure) continue;
      if (ranged && !(w.flags[s] & Flag.Blocking)) continue;
      const dx = w.x[s] - x, dy = w.y[s] - y, d2 = dx * dx + dy * dy;
      if (d2 < bestD) { best = s; bestD = d2; }
    }
    if (best >= 0) return best;
  }
  return run.core;
}

function enemyAiSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  const hw = w.highWater;
  for (let e = 0; e < hw; e++) {
    if (w.kind[e] !== Kind.Enemy) continue;
    const t = chooseEnemyTarget(run, e);
    w.target[e] = t;
    const dx = w.x[t] - w.x[e], dy = w.y[t] - w.y[e];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const reach = w.wRange[e] + w.radius[e] + w.radius[t];
    const spd = w.speed[e] * w.speedBuff[e];
    if (dist > 1e-6) { w.fx[e] = dx / dist; w.fy[e] = dy / dist; }
    if (dist > reach * 0.9) {
      w.vx[e] = w.fx[e] * spd;
      w.vy[e] = w.fy[e] * spd;
    } else { w.vx[e] = 0; w.vy[e] = 0; }
    if (dist <= reach) {
      const aim = run.idx.enemies[w.def[e]].aimTime;
      if ((w.flags[e] & Flag.Ranged) && aim > 0) {
        if (w.atkT[e] <= 0) {
          w.aimT[e] += DT;
          if (w.aimT[e] >= aim) { w.aimT[e] = 0; ctx.attack(e, t); }
        }
      } else ctx.attack(e, t);
    } else w.aimT[e] = 0;
  }
}

function allySystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  for (let k = 0; k < run.allies.length; k++) {
    const a = run.allies[k];
    if (w.flags[a] & Flag.Down) continue;
    const di = run.allyDefs[k];
    run.res.personalities[di].tick(ctx, a, run.idx.heroes[di].params);
  }
}

function structureSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  const hw = w.highWater;
  const rules = run.worldDef.rules;
  for (let i = 0; i < hw; i++) {
    if (w.kind[i] !== Kind.Structure) continue;
    const di = w.def[i];
    const beh = run.res.buildingBehaviors[di];
    if (beh.tick) beh.tick(ctx, i, run.idx.buildings[di].params);
    if (w.kind[i] === Kind.Structure && w.burnT[i] > 0) {
      w.burnT[i] -= DT;
      ctx.damage(i, rules.burnDps * DT, DamageType.Fire, -1);
      if (w.kind[i] === Kind.Structure && w.burnT[i] <= 0) ctx.emit({ type: 'burn', e: i, uid: w.uid[i], kind: Kind.Structure, state: 'end' });
    }
  }
}

/**
 * Enemy burning (engine feature; sources call ctx.igniteEnemy). Once per tick: every burning enemy
 * takes world rules.burnDps × DT fire damage (ignores armor). Emits `burn: end` when it goes out.
 */
function enemyBurnSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  const hw = w.highWater;
  const dps = run.worldDef.rules.burnDps;
  for (let i = 0; i < hw; i++) {
    if (w.kind[i] !== Kind.Enemy || w.burnT[i] <= 0) continue;
    w.burnT[i] -= DT;
    if (w.burnT[i] <= 1e-9) {
      w.burnT[i] = 0;
      w.flags[i] &= ~Flag.Fire;
      ctx.emit({ type: 'burn', e: i, uid: w.uid[i], kind: Kind.Enemy, state: 'end' });
    }
    ctx.damage(i, dps * DT, DamageType.Fire, -1);
  }
}

function heroAttackSystem(run: Run, ctx: Ctx): void {
  const w = run.w, h = run.hero;
  if (w.atkT[h] > 0) return;
  const t = ctx.nearestEnemy(w.x[h], w.y[h], w.wRange[h] + w.radius[h]);
  w.target[h] = t;
  if (t >= 0) ctx.attack(h, t);
}

function bossSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  for (let k = 0; k < run.bosses.length; k++) {
    const b = run.bosses[k];
    if (!w.isAlive(b.e) || w.uid[b.e] !== b.uid) continue;
    const bd = run.idx.bosses[b.def];
    const script = run.res.bossScripts[b.def];
    b.t += DT;
    const frac = w.hp[b.e] / w.maxHp[b.e];
    let phase = b.phase;
    for (let p = b.phase + 1; p < bd.phases.length; p++) if (frac <= bd.phases[p].hpBelow) phase = p;
    if (phase !== b.phase) {
      b.phase = phase;
      applyBossStats(run, b);
      ctx.emit({ type: 'bossPhase', e: b.e, bossId: bd.id, phase });
      emitBossLine(run, b, 'phase', str(bd.phases[phase].params, 'lineKey'));
      if (script.onPhase) script.onPhase(ctx, b, bd.phases[phase].params, bd.params);
    }
    if (!b.enraged && bd.enrageSeconds > 0 && b.t >= bd.enrageSeconds) {
      b.enraged = true;
      applyBossStats(run, b);
      ctx.emit({ type: 'enrage', e: b.e, bossId: bd.id });
      if (script.onEnrage) script.onEnrage(ctx, b, bd.params);
    }
    if (w.isAlive(b.e)) script.tick(ctx, b, bd.phases[b.phase].params, bd.params);
  }
}

function cardTickSystem(run: Run, ctx: Ctx): void {
  for (let k = 0; k < run.cards.length; k++) {
    const c = run.cards[k];
    const ci = run.idx.cardIdx.get(c.id)!;
    const eff = run.res.cardEffects[ci];
    if (eff.onTick) eff.onTick(ctx, c.level, run.idx.cards[ci].params);
  }
}

function cooldownSystem(run: Run): void {
  const w = run.w;
  for (let i = 0; i < w.highWater; i++) if (w.atkT[i] > 0) w.atkT[i] -= DT;
}

/** Push circle (x,y,r) out of the axis-aligned square centred (sx,sy) with half-size hs. */
function pushOutOfSquare(w: World, e: number, sx: number, sy: number, hs: number): boolean {
  const r = w.radius[e];
  const qx = Math.max(sx - hs, Math.min(w.x[e], sx + hs));
  const qy = Math.max(sy - hs, Math.min(w.y[e], sy + hs));
  let dx = w.x[e] - qx, dy = w.y[e] - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const push = r - d;
    w.x[e] += (dx / d) * push;
    w.y[e] += (dy / d) * push;
  } else {
    // Centre inside the square: exit along the shallowest axis.
    dx = w.x[e] - sx; dy = w.y[e] - sy;
    if (Math.abs(dx) > Math.abs(dy)) w.x[e] = sx + (dx >= 0 ? hs + r : -hs - r);
    else w.y[e] = sy + (dy >= 0 ? hs + r : -hs - r);
  }
  return true;
}

function movementSystem(run: Run): void {
  const w = run.w;
  const { width, height } = run.worldDef.arena;
  const hw = w.highWater;
  const ps = run.playerSide;
  const scratch = run.scratch2;
  for (let i = 0; i < hw; i++) {
    const k = w.kind[i];
    if (k !== Kind.Hero && k !== Kind.Enemy && k !== Kind.Ally) continue;
    if (w.flags[i] & Flag.Down) continue;
    // Clamp to max speed (personalities may ask for more).
    let vx = w.vx[i], vy = w.vy[i];
    const max = w.speed[i] * w.speedBuff[i];
    const v2 = vx * vx + vy * vy;
    if (v2 > max * max && v2 > 0) { const s = max / Math.sqrt(v2); vx *= s; vy *= s; }
    w.x[i] += vx * DT;
    w.y[i] += vy * DT;

    // Enemy separation (soft, positional). Bosses are not pushed.
    if (k === Kind.Enemy && !(w.flags[i] & Flag.Boss)) {
      const n = run.hash.query(w.x[i], w.y[i], w.radius[i], scratch);
      for (let j = 0; j < n; j++) {
        const o = scratch[j];
        if (o === i || w.kind[o] !== Kind.Enemy) continue;
        const dx = w.x[i] - w.x[o], dy = w.y[i] - w.y[o];
        const rr = w.radius[i] + w.radius[o];
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          w.x[i] += (dx / d) * push;
          w.y[i] += (dy / d) * push;
        } else if (o < i) { w.x[i] += 0.5; }
      }
    }

    // Structures and the Core block ground units.
    w.blockedBy[i] = -1;
    if (!(w.flags[i] & Flag.Flying)) {
      for (let s = 1; s < run.playerSideCount; s++) {
        const o = ps[s];
        if (!(w.flags[o] & Flag.Blocking) || !w.isAlive(o)) continue;
        const kind = w.kind[o];
        if (kind === Kind.Core) {
          const dx = w.x[i] - w.x[o], dy = w.y[i] - w.y[o];
          const rr = w.radius[i] + w.radius[o];
          const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr && d2 > 1e-12) {
            const d = Math.sqrt(d2);
            w.x[i] = w.x[o] + (dx / d) * rr;
            w.y[i] = w.y[o] + (dy / d) * rr;
          }
        } else if (kind === Kind.Structure) {
          if (pushOutOfSquare(w, i, w.x[o], w.y[o], w.radius[o]) && k === Kind.Enemy) w.blockedBy[i] = o;
        }
      }
    }

    // Arena bounds.
    const r = w.radius[i];
    if (w.x[i] < r) w.x[i] = r; else if (w.x[i] > width - r) w.x[i] = width - r;
    if (w.y[i] < r) w.y[i] = r; else if (w.y[i] > height - r) w.y[i] = height - r;
  }
}

/**
 * Squared distance from (cx, cy) to the segment (ax, ay)→(ax+sx, ay+sy). Used for swept projectile
 * collision: a fast shot travels up to ~19 px per tick, more than an enemy's diameter, so testing
 * only the end point lets point-blank shots pass straight through targets.
 */
function segDist2(ax: number, ay: number, sx: number, sy: number, cx: number, cy: number): number {
  const len2 = sx * sx + sy * sy;
  let t = len2 > 0 ? ((cx - ax) * sx + (cy - ay) * sy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + sx * t - cx, dy = ay + sy * t - cy;
  return dx * dx + dy * dy;
}

function projectileSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  const hw = w.highWater;
  const { width, height } = run.worldDef.arena;
  const scratch = run.scratch2;
  for (let p = 0; p < hw; p++) {
    if (w.kind[p] !== Kind.Projectile) continue;
    const ax = w.x[p], ay = w.y[p];
    const sx = w.vx[p] * DT, sy = w.vy[p] * DT;
    w.x[p] = ax + sx;
    w.y[p] = ay + sy;
    w.life[p] -= DT;
    const crit = (w.flags[p] & Flag.Crit) !== 0;
    const owner = w.owner[p];
    let gone = false;
    if (w.team[p] === Team.Player) {
      // Query around the segment midpoint with a radius covering half its length.
      const half = Math.sqrt(sx * sx + sy * sy) * 0.5;
      const n = run.hash.query(ax + sx * 0.5, ay + sy * 0.5, w.radius[p] + half, scratch);
      // Hit in order along the path (then by id), so piercing resolves deterministically.
      for (let j = 0; j < n && !gone; j++) {
        let best = -1, bestT = Infinity;
        for (let k = 0; k < n; k++) {
          const e = scratch[k];
          if (e < 0 || w.kind[e] !== Kind.Enemy || e === w.lastHit[p]) continue;
          const rr = w.radius[e] + w.radius[p];
          if (segDist2(ax, ay, sx, sy, w.x[e], w.y[e]) > rr * rr) continue;
          const t = (w.x[e] - ax) * sx + (w.y[e] - ay) * sy;
          if (t < bestT || (t === bestT && e < best)) { bestT = t; best = e; }
        }
        if (best < 0) break;
        for (let k = 0; k < n; k++) if (scratch[k] === best) scratch[k] = -1;
        w.lastHit[p] = best;
        ctx.damage(best, w.wDamage[p], w.wType[p] as DamageType, owner, crit);
        w.value[p] -= 1;
        if (w.value[p] < 0) { w.release(p); gone = true; }
      }
    } else {
      for (let k = 0; k < run.playerSideCount; k++) {
        const t = run.playerSide[k];
        if (!w.isAlive(t) || (w.flags[t] & Flag.Down) || t === w.lastHit[p]) continue;
        const kind = w.kind[t];
        // Arrows fly over traps (non-blocking structures). Ranged enemies never target those
        // (chooseEnemyTarget), so this cannot soft-lock a wave.
        if (kind === Kind.Structure && !(w.flags[t] & Flag.Blocking)) continue;
        const rr = w.radius[t] + w.radius[p];
        if (segDist2(ax, ay, sx, sy, w.x[t], w.y[t]) > rr * rr) continue;
        w.lastHit[p] = t;
        ctx.damage(t, w.wDamage[p], w.wType[p] as DamageType, owner);
        w.release(p);
        gone = true;
        break;
      }
    }
    if (!gone && (w.life[p] <= 0 || w.x[p] < 0 || w.y[p] < 0 || w.x[p] > width || w.y[p] > height)) w.release(p);
  }
}

function insideTelegraph(t: Telegraph, x: number, y: number, r: number): boolean {
  const dx = x - t.x, dy = y - t.y;
  const d2 = dx * dx + dy * dy;
  switch (t.shape) {
    case 'circle': return d2 <= (t.r + r) * (t.r + r);
    case 'ring': return d2 <= (t.r + r) * (t.r + r) && d2 >= Math.max(0, t.r2 - r) * Math.max(0, t.r2 - r);
    case 'rect': {
      const along = dx * t.dx + dy * t.dy;
      const across = -dx * t.dy + dy * t.dx;
      return along >= -r && along <= t.r + r && Math.abs(across) <= t.r2 + r;
    }
    case 'cone': {
      if (d2 > (t.r + r) * (t.r + r)) return false;
      if (d2 < 1e-9) return true;
      const d = Math.sqrt(d2);
      return (dx * t.dx + dy * t.dy) / d >= t.r2;
    }
  }
}

function telegraphSystem(run: Run, ctx: Ctx): void {
  const w = run.w;
  const list = run.telegraphs;
  for (let k = 0; k < list.length; k++) {
    const t = list[k];
    if (!t.active) continue;
    if (t.owner >= 0 && !w.isAlive(t.owner)) { t.active = false; continue; }
    t.t += DT;
    if (t.t + 1e-9 >= t.windup) {
      t.active = false;
      ctx.emit({ type: 'telegraph', id: t.id, state: 'impact', targetsCore: t.targetsCore });
      for (let i = 0; i < run.playerSideCount; i++) {
        const e = run.playerSide[i];
        if (!w.isAlive(e) || (w.flags[e] & Flag.Down)) continue;
        if (insideTelegraph(t, w.x[e], w.y[e], w.radius[e])) ctx.damage(e, t.damage, DamageType.Physical, t.owner);
      }
    }
  }
  let n = 0;
  for (let k = 0; k < list.length; k++) if (list[k].active) list[n++] = list[k];
  list.length = n;
}

function collectPickup(run: Run, p: number): void {
  const w = run.w;
  const type = w.def[p] as PickupType;
  const v = w.value[p];
  if (type === PickupType.Xp) gainXp(run, v);
  else if (type === PickupType.Wood) run.wood += v;
  else run.stone += v;
  run.events.push({ type: 'pickup', pickup: type, amount: v });
  w.release(p);
}

function pickupSystem(run: Run): void {
  const w = run.w, h = run.hero;
  const hx = w.x[h], hy = w.y[h];
  const magnet = run.balance.playerHero.pickupRadius * run.mods.pickupRadiusMult;
  const m2 = magnet * magnet;
  const grab = w.radius[h] + 4;
  const g2 = grab * grab;
  const step = run.balance.pickupMagnetSpeed * DT;
  for (let p = 0; p < w.highWater; p++) {
    if (w.kind[p] !== Kind.Pickup) continue;
    const dx = hx - w.x[p], dy = hy - w.y[p];
    const d2 = dx * dx + dy * dy;
    if (d2 <= g2) { collectPickup(run, p); continue; }
    if (d2 <= m2 || w.aux0[p] > 0) {
      w.aux0[p] = 1; // once magnetised, keeps homing
      const d = Math.sqrt(d2);
      const s = Math.min(step, d);
      w.x[p] += (dx / d) * s;
      w.y[p] += (dy / d) * s;
    }
  }
}

function regenSystem(run: Run): void {
  const r = run.mods.regenPerSec;
  if (r <= 0) return;
  const w = run.w, h = run.hero;
  w.hp[h] = Math.min(w.maxHp[h], w.hp[h] + r * DT);
}


