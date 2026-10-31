/**
 * Zod schemas for every content type. Content JSON lives in `packages/content/data/` and is
 * validated by `loadContent()` (src/index.ts). Balance numbers belong in JSON, never in code.
 *
 * Conventions
 * - `id`: kebab-case, unique per type. Core and other content reference things by id.
 * - Every user-facing string is an i18n key (`nameKey`, `descKey`, `drawbackKey`, …), never prose.
 *   `packages/i18n/test/content-keys.test.ts` fails when a key is missing from th.json or en.json.
 * - Durations are in **seconds**, distances in **world px** (1 tile = 40 px), speeds in px/s.
 * - `behavior` / `effect` / `personality` / `script` fields name an id registered in a
 *   `packages/core/src/registry/*` registry; `params` is passed verbatim to that code.
 */
import { z } from 'zod';

export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case id');
export const I18nKey = z.string().regex(/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/, 'dotted i18n key');

/** Free-form numeric parameters for registry code. A number[] is a per-level table (index = level-1). */
export const Params = z.record(z.string(), z.union([z.number(), z.array(z.number()), z.string(), z.boolean()]));
export type Params = z.infer<typeof Params>;

export const Cost = z.object({ wood: z.number().int().nonnegative().default(0), stone: z.number().int().nonnegative().default(0) });
export type Cost = z.infer<typeof Cost>;

/** Render hints for the placeholder renderer (docs/design/readability.md §4). */
export const RenderHint = z.object({
  shape: z.enum([
    'circle', 'triangle', 'triangle-flame', 'hexagon', 'diamond', 'chevron', 'circle-ticks',
    'octagon', 'square', 'rounded-square', 'square-planks', 'square-bricks', 'square-tower', 'ring-dashed',
  ]),
  /** Optional multiplier on the body size (mini-boss = 2.2). */
  scale: z.number().positive().default(1),
  /** Mini-boss crown, boss blot, etc. Free-form flags for the renderer. */
  marks: z.array(z.string()).default([]),
});
export type RenderHint = z.infer<typeof RenderHint>;

export const Weapon = z.object({
  /** Damage per hit before multipliers. */
  damage: z.number().nonnegative(),
  /** Seconds between attacks. */
  cooldown: z.number().positive(),
  /** Max distance (edge to edge) at which it starts attacking. */
  range: z.number().nonnegative(),
  /** 0 = melee (instant hit). >0 = fires a projectile at this speed. */
  projectileSpeed: z.number().nonnegative().default(0),
  projectileRadius: z.number().positive().default(5),
  /** Enemies a projectile can pass through after the first. */
  pierce: z.number().int().nonnegative().default(0),
  /** Projectiles per volley (spread fan). */
  count: z.number().int().positive().default(1),
  damageType: z.enum(['physical', 'fire']).default('physical'),
});
export type Weapon = z.infer<typeof Weapon>;

/* ------------------------------------------------------------------------------------------ */
/* Enemies                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export const EnemyTier = z.enum(['normal', 'elite', 'miniboss', 'boss']);
export type EnemyTier = z.infer<typeof EnemyTier>;

export const BehaviorRef = z.object({ id: Id, params: Params.default({}) });
export type BehaviorRef = z.infer<typeof BehaviorRef>;

export const EnemyDef = z.object({
  id: Id,
  nameKey: I18nKey,
  descKey: I18nKey,
  /** Intel margin note shown during prep ("burns wood"). */
  counterKey: I18nKey.optional(),
  /** Score tier: kill points come from balance.scoring.killPoints[tier]. */
  tier: EnemyTier,
  hp: z.number().positive(),
  speed: z.number().nonnegative(),
  radius: z.number().positive(),
  /** Fraction of physical damage ignored, 0..0.9. */
  armor: z.number().min(0).max(0.9).default(0),
  /**
   * What it walks toward. `core`: the Core (diverted by hero/ally aggro unless ignoresAggro).
   * `hero`: the player hero. `structure`: nearest structure, else Core.
   */
  targeting: z.enum(['core', 'hero', 'structure']).default('core'),
  ignoresAggro: z.boolean().default(false),
  /** Flies over walls (ignores structure collision). */
  flying: z.boolean().default(false),
  /** Distance at which hero / allies pull a `core`-targeting enemy off its path. */
  aggroRadius: z.number().nonnegative().default(160),
  weapon: Weapon,
  /** Seconds a ranged enemy aims (shows an aim line) before firing. */
  aimTime: z.number().nonnegative().default(0),
  xp: z.number().nonnegative(),
  drops: z.object({
    wood: z.number().nonnegative().default(0),
    stone: z.number().nonnegative().default(0),
    /** Chance 0..1 that the resource drop happens at all. */
    chance: z.number().min(0).max(1).default(1),
  }).default({ wood: 0, stone: 0, chance: 1 }),
  /** Enemy behaviours from `registry/enemyBehaviors.ts` (e.g. ignite, drum-buff). */
  behaviors: z.array(BehaviorRef).default([]),
  /** Boss / mini-boss script id from `content/bosses.json`. */
  boss: Id.optional(),
  render: RenderHint,
});
export type EnemyDef = z.infer<typeof EnemyDef>;

/* ------------------------------------------------------------------------------------------ */
/* Bosses                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export const BossPhase = z.object({
  /** Phase is active while hp fraction is <= this value. First phase must be 1. */
  hpBelow: z.number().min(0).max(1),
  params: Params.default({}),
});

export const BossDef = z.object({
  id: Id,
  nameKey: I18nKey,
  /** Script id from `registry/bossScripts.ts`. */
  script: Id,
  phases: z.array(BossPhase).min(1),
  /** Seconds after spawn before enrage (0 = never). */
  enrageSeconds: z.number().nonnegative().default(0),
  enrageDamageMult: z.number().positive().default(1.5),
  enrageSpeedMult: z.number().positive().default(1.3),
  params: Params.default({}),
});
export type BossDef = z.infer<typeof BossDef>;

/* ------------------------------------------------------------------------------------------ */
/* Cards                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export const CardDef = z.object({
  id: Id,
  nameKey: I18nKey,
  descKey: I18nKey,
  /** Present when the card has a cost (GDD §3 "การ์ดสกิลมีราคา"). */
  drawbackKey: I18nKey.optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  /** Relative draw weight. */
  weight: z.number().positive().default(1),
  maxLevel: z.number().int().positive().default(1),
  /** Effect id from `registry/cards.ts`. */
  effect: Id,
  params: Params.default({}),
  tags: z.array(z.string()).default([]),
});
export type CardDef = z.infer<typeof CardDef>;

/* ------------------------------------------------------------------------------------------ */
/* Buildings                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export const BuildingDef = z.object({
  id: Id,
  nameKey: I18nKey,
  descKey: I18nKey,
  material: z.enum(['wood', 'stone']),
  cost: Cost,
  upkeep: Cost,
  hp: z.number().positive(),
  /** Torch-bearers can ignite it. */
  flammable: z.boolean(),
  /** Enemies collide with it (walls, towers). Traps are false. */
  blocking: z.boolean(),
  /** Behaviour id from `registry/buildings.ts`. Walls use `static`. */
  behavior: Id,
  params: Params.default({}),
  render: RenderHint,
});
export type BuildingDef = z.infer<typeof BuildingDef>;

/* ------------------------------------------------------------------------------------------ */
/* Heroes                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export const AllyHeroDef = z.object({
  id: Id,
  nameKey: I18nKey,
  descKey: I18nKey,
  /** Personality word shown on the hero chip. */
  personalityKey: I18nKey,
  stars: z.number().int().min(1).max(5),
  hp: z.number().positive(),
  speed: z.number().positive(),
  radius: z.number().positive(),
  weapon: Weapon,
  /** Personality id from `registry/personalities.ts`. */
  personality: Id,
  params: Params.default({}),
  render: RenderHint,
});
export type AllyHeroDef = z.infer<typeof AllyHeroDef>;

export const PlayerHeroDef = z.object({
  hp: z.number().positive(),
  speed: z.number().positive(),
  radius: z.number().positive(),
  pickupRadius: z.number().positive(),
  armor: z.number().min(0).max(0.9).default(0),
  weapon: Weapon,
});
export type PlayerHeroDef = z.infer<typeof PlayerHeroDef>;

/* ------------------------------------------------------------------------------------------ */
/* World + waves                                                                              */
/* ------------------------------------------------------------------------------------------ */

export const Side = z.enum(['N', 'E', 'S', 'W']);
export type Side = z.infer<typeof Side>;

export const SpawnGroup = z.object({
  enemy: Id,
  count: z.number().int().positive(),
  side: Side,
  /** Seconds after wave start before the first spawn. */
  delay: z.number().nonnegative().default(0),
  /** Seconds between spawns in this group. */
  interval: z.number().nonnegative().default(0.5),
});
export type SpawnGroup = z.infer<typeof SpawnGroup>;

export const WaveDef = z.object({
  kind: z.enum(['normal', 'miniboss', 'boss']).default('normal'),
  groups: z.array(SpawnGroup).min(1),
  /** Resources granted when the wave is cleared. */
  clearBonus: Cost.default({ wood: 0, stone: 0 }),
});
export type WaveDef = z.infer<typeof WaveDef>;

export const WorldDef = z.object({
  id: Id,
  nameKey: I18nKey,
  descKey: I18nKey,
  arena: z.object({ width: z.number().positive(), height: z.number().positive() }),
  core: z.object({ hp: z.number().positive(), radius: z.number().positive() }),
  buildGrid: z.object({
    cellSize: z.number().positive(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    /**
     * One string per row, `cols` chars each: `.` buildable, `#` blocked (Core sits here).
     * The grid is centred on the Core.
     */
    mask: z.array(z.string()),
    /** Max structures alive at once ("limited build slots"). */
    maxSlots: z.number().int().positive(),
  }),
  /** Seconds of prep before each wave. */
  prepSeconds: z.number().positive(),
  /** Standard clear time in seconds for the speed multiplier (GDD §12). */
  standardTimeSeconds: z.number().positive(),
  /** Recommended power for the difficulty limiter. */
  recommendedPower: z.number().positive(),
  startingResources: Cost,
  /** World rule parameters, e.g. burning structures. */
  rules: z.object({
    burnDps: z.number().nonnegative().default(0),
    burnSeconds: z.number().nonnegative().default(0),
  }).default({ burnDps: 0, burnSeconds: 0 }),
  waves: z.array(WaveDef).min(1),
});
export type WorldDef = z.infer<typeof WorldDef>;

/* ------------------------------------------------------------------------------------------ */
/* Balance (GDD §12)                                                                          */
/* ------------------------------------------------------------------------------------------ */

export const Grade = z.enum(['S', 'A', 'B', 'C']);
export type Grade = z.infer<typeof Grade>;

export const BalanceDef = z.object({
  playerHero: PlayerHeroDef,
  /** XP needed to go from in-stage level L to L+1 is xpTable[L-1]; last entry repeats. */
  xpTable: z.array(z.number().positive()).min(1),
  cardChoices: z.number().int().positive(),
  rerollsPerRun: z.number().int().nonnegative(),
  sellRefund: z.number().min(0).max(1),
  /** Fraction of max HP a structure loses per unpaid upkeep. */
  upkeepDecay: z.number().min(0).max(1),
  /** Seconds an AI hero stays down before reviving (it always revives at prep start). */
  allyReviveAtPrep: z.boolean().default(true),
  pickupMagnetSpeed: z.number().positive(),
  scoring: z.object({
    killPoints: z.object({ normal: z.number(), elite: z.number(), miniboss: z.number(), boss: z.number() }),
    bossBonus: z.number(),
    difficulty: z.object({
      normal: z.number(), hard: z.number(), nightmare: z.number(),
      hardcoreRuleBonus: z.number(), max: z.number(),
    }),
    speed: z.object({ min: z.number(), max: z.number() }),
    /** M_damage = (coreBase + coreWeight*coreHpFrac) * (heroBase - heroWeight*heroDamageFrac) */
    damage: z.object({ coreBase: z.number(), coreWeight: z.number(), heroBase: z.number(), heroWeight: z.number() }),
    /** Grade by M_speed * M_damage: first band whose `min` is met, checked S→C. */
    grades: z.array(z.object({ grade: Grade, min: z.number(), rewardPct: z.number() })).length(4),
  }),
  difficultyLimiter: z.object({
    /** Max bonus from power above recommended (0.10 = +10%). */
    cap: z.number().nonnegative(),
  }),
});
export type BalanceDef = z.infer<typeof BalanceDef>;

/* ------------------------------------------------------------------------------------------ */

export const ContentBundle = z.object({
  version: z.string(),
  balance: BalanceDef,
  worlds: z.array(WorldDef).min(1),
  enemies: z.array(EnemyDef).min(1),
  bosses: z.array(BossDef),
  cards: z.array(CardDef),
  buildings: z.array(BuildingDef),
  heroes: z.array(AllyHeroDef),
});
export type ContentBundle = z.infer<typeof ContentBundle>;
/** Input shape (before defaults are applied) — what JSON files contain. */
export type ContentBundleInput = z.input<typeof ContentBundle>;
