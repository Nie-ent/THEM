/**
 * Effect registries — the extension points laborers plug content code into.
 *
 * Content JSON names an id (`card.effect`, `building.behavior`, `hero.personality`,
 * `boss.script`, `enemy.behaviors[].id`); code registered under that id runs it. `createRun`
 * validates every reference and throws a readable error for unknown ids.
 *
 * How to add one: create a file under `src/effects/<registry>/`, call `<registry>.register({...})`
 * at module top level, and import the file from `src/effects/<registry>/index.ts`. Each folder has a
 * fully worked example to copy. Read `src/effects/README.md` first.
 *
 * Rules for registry code (determinism, CLAUDE.md rule 2):
 * - Randomness only through `ctx.rng`. No Math.random / Date / trig (Math.sin/cos/atan2).
 * - No allocation in `tick` hooks if avoidable (they run per entity per tick).
 * - Numbers come from `params` (content JSON), not literals. Use `num(params, 'key', level)`.
 * - Keep per-entity state in `w.aux0` / `w.aux1`, per-boss state in `boss.state`, per-card state in
 *   `run.cardState` — these are included in the determinism hash. Never use module-level variables.
 */
import type { Params } from '@them/content';
import type { Ctx } from './ctx';
import type { BossRuntime, Mods } from './types';

export class Registry<T extends { id: string }> {
  private readonly items = new Map<string, T>();
  constructor(readonly name: string) {}

  register(item: T): T {
    if (this.items.has(item.id)) throw new Error(`${this.name}: duplicate id "${item.id}"`);
    this.items.set(item.id, item);
    return item;
  }

  get(id: string): T {
    const v = this.items.get(id);
    if (!v) throw new Error(`${this.name}: unknown id "${id}". Registered: ${[...this.items.keys()].join(', ')}`);
    return v;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  ids(): string[] {
    return [...this.items.keys()].sort();
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Cards                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export interface CardEffect {
  id: string;
  /**
   * Pure stat changes. Called on a fresh `Mods` for every owned card after each pick, in pick
   * order, so it must only read `level`/`params` and write `mods`. Most cards only need this.
   */
  apply?(mods: Mods, level: number, params: Params): void;
  /** One-shot side effect when picked (e.g. heal, spawn a turret). */
  onPick?(ctx: Ctx, level: number, params: Params): void;
  /** Every tick during a wave while owned. */
  onTick?(ctx: Ctx, level: number, params: Params): void;
  /** After the hero damages an enemy (melee or projectile). */
  onHeroHit?(ctx: Ctx, target: number, amount: number, level: number, params: Params): void;
  /** After any enemy dies to the hero, allies or structures. */
  onKill?(ctx: Ctx, enemy: number, level: number, params: Params): void;
}
export const cardEffects = new Registry<CardEffect>('cardEffects');

/* ------------------------------------------------------------------------------------------ */
/* Buildings                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface BuildingBehavior {
  id: string;
  /** After the structure entity is created (weapon columns are zero; set them here). */
  onPlace?(ctx: Ctx, e: number, params: Params): void;
  /** Every tick during a wave. */
  tick?(ctx: Ctx, e: number, params: Params): void;
}
export const buildingBehaviors = new Registry<BuildingBehavior>('buildingBehaviors');

/* ------------------------------------------------------------------------------------------ */
/* AI hero personalities                                                                      */
/* ------------------------------------------------------------------------------------------ */

export interface Personality {
  id: string;
  /**
   * Every tick during a wave while the ally is up. Set `w.vx/vy` (px/s) for movement — the
   * movement system integrates and clamps speed — and call `ctx.attack(e, target)` to fight.
   * The ally's post is `w.hx/hy` (set during prep by the player).
   */
  tick(ctx: Ctx, e: number, params: Params): void;
}
export const personalities = new Registry<Personality>('personalities');

/* ------------------------------------------------------------------------------------------ */
/* Boss scripts                                                                               */
/* ------------------------------------------------------------------------------------------ */

export interface BossScript {
  id: string;
  /** When the boss spawns (phase 0). */
  onSpawn?(ctx: Ctx, boss: BossRuntime, params: Params): void;
  /** When the HP threshold moves the boss into `boss.phase` (>= 1). */
  onPhase?(ctx: Ctx, boss: BossRuntime, phaseParams: Params, params: Params): void;
  /** When the enrage timer fires (stats are already multiplied). */
  onEnrage?(ctx: Ctx, boss: BossRuntime, params: Params): void;
  /**
   * Every tick. Movement and basic weapon use are handled by the normal enemy systems; scripts add
   * special attacks, usually via `ctx.telegraph(...)`. `phaseParams` = `phases[boss.phase].params`.
   */
  tick(ctx: Ctx, boss: BossRuntime, phaseParams: Params, params: Params): void;
}
export const bossScripts = new Registry<BossScript>('bossScripts');

/* ------------------------------------------------------------------------------------------ */
/* Enemy behaviours (small composable add-ons on top of seek + weapon)                        */
/* ------------------------------------------------------------------------------------------ */

export interface EnemyBehavior {
  id: string;
  onSpawn?(ctx: Ctx, e: number, params: Params): void;
  /** Every tick, after targeting and before movement. */
  tick?(ctx: Ctx, e: number, params: Params): void;
  /** After this enemy lands a melee hit. */
  onMeleeHit?(ctx: Ctx, e: number, target: number, params: Params): void;
  onDeath?(ctx: Ctx, e: number, params: Params): void;
}
export const enemyBehaviors = new Registry<EnemyBehavior>('enemyBehaviors');
