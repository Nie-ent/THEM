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

/**
 * Stat overrides the sim applies to a boss entity. Scripts never write armor/speed/damage columns;
 * they pick a phase (by HP) and optionally a named stance (`ctx.bossStance`). Effective stats:
 *   armor  = stance.armor ?? phase.armor ?? enemy.armor
 *   speed  = enemy.speed  × phase.speedMult  × stance.speedMult  × (enraged ? enrageSpeedMult : 1)
 *   damage = weapon.damage × phase.damageMult × stance.damageMult × (enraged ? enrageDamageMult : 1)
 */
export const BossStats = z.object({
  armor: z.number().min(0).max(0.9).optional(),
  speedMult: z.number().positive().optional(),
  damageMult: z.number().positive().optional(),
});
export type BossStats = z.infer<typeof BossStats>;

export const BossPhase = BossStats.extend({
  /** Phase is active while hp fraction is <= this value. First phase must be 1. */
  hpBelow: z.number().min(0).max(1),
  /** Optional `lineKey` (string) in params is emitted as a `bossLine` event on entering the phase. */
  params: Params.default({}),
});

export const BossDef = z.object({
  id: Id,
  nameKey: I18nKey,
  /** Script id from `registry/bossScripts.ts`. */
  script: Id,
  phases: z.array(BossPhase).min(1),
  /** Named stat stances a script can switch between with `ctx.bossStance(boss, name | null)`. */
  stances: z.record(z.string(), BossStats).default({}),
  /** Seconds after spawn before enrage (0 = never). */
  enrageSeconds: z.number().nonnegative().default(0),
  enrageDamageMult: z.number().positive().default(1.5),
  enrageSpeedMult: z.number().positive().default(1.3),
  /** Optional string params `introKey` / `defeatKey` are emitted as `bossLine` events. */
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
  /**
   * Base rewards for clearing the world at 100% (grade A). Scaled by the grade's `rewardPct`
   * (`@them/meta`). Keys are currency ids from `meta.currencies`.
   */
  rewards: z.record(Id, z.number().int().nonnegative()).default({}),
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
/* Meta progression (Phase 2, `@them/meta`)                                                   */
/* ------------------------------------------------------------------------------------------ */

export const CurrencyDef = z.object({ id: Id, nameKey: I18nKey });
export type CurrencyDef = z.infer<typeof CurrencyDef>;

export const MetaDef = z.object({
  /** Currencies the profile tracks. Premium currency is added here when the owner decides. */
  currencies: z.array(CurrencyDef).min(1),
  /** Max AI heroes brought into a run. */
  maxTeamSize: z.number().int().positive(),
  /** What a brand-new profile starts with. */
  startingProfile: z.object({
    currencies: z.record(Id, z.number().int().nonnegative()).default({}),
    /** Hero ids owned from the start (content `heroes[].id`), each at its content star rating. */
    heroes: z.array(Id).default([]),
    /** Hero ids brought into runs; must be owned. */
    team: z.array(Id).default([]),
  }),
  runRewards: z.object({
    /**
     * GDD §3: a lost run still pays part of the reward by waves cleared. When true, a loss pays
     * `rewardPct` (always the lowest band) × wavesCleared / waveCount.
     */
    lossScalesByWavesCleared: z.boolean(),
  }),
  /** Global Level (GDD §4, §12). */
  globalLevel: z.object({
    cap: z.number().int().min(2),
    /**
     * EXP to go from level L to L+1 is `expToNext[L-1]` (GDD §12: 20 × L^2.2, rounded). Stored as a
     * table so every platform gets the same integers; length must be `cap - 1`.
     */
    expToNext: z.array(z.number().int().positive()),
    statPointsPerLevel: z.number().int().nonnegative(),
    traitPointsPerLevel: z.number().int().nonnegative(),
    /** Stat reset is free up to and including this level (GDD §5: until the first class at Lv 10). */
    freeRespecUntilLevel: z.number().int().nonnegative(),
  }),
  /** Account EXP per run at grade A (100%): base + perLevel × Global Level (GDD §12). Scaled like other rewards. */
  runExp: z.object({ base: z.number().nonnegative(), perLevel: z.number().nonnegative() }),
  /**
   * What one point in each stat gives, as run modifiers (core `Mods` keys, stat-mods convention:
   * `*Mult` = fraction, others added). GDD §4: strength → physical attack, intellect → cooldown,
   * agility → speed + crit, vitality → HP + armour, command → structures and AI heroes.
   */
  stats: z.object({
    strength: z.record(z.string(), z.number()),
    intellect: z.record(z.string(), z.number()),
    agility: z.record(z.string(), z.number()),
    vitality: z.record(z.string(), z.number()),
    command: z.record(z.string(), z.number()),
  }),
  /** Max absolute value of each stat-derived mod (e.g. cooldownMult -0.3 = at most 30% faster). */
  statCaps: z.record(z.string(), z.number()).default({}),
  /** Stackable items the profile can hold (`profile.items`): respec crystals, EXP books, shards … */
  items: z.array(z.object({ id: Id, nameKey: I18nKey })).default([]),
});
export type MetaDef = z.infer<typeof MetaDef>;

/* ------------------------------------------------------------------------------------------ */
/* Trait Tree (GDD §5, P2-03)                                                                  */
/* ------------------------------------------------------------------------------------------ */

export const TraitBranchDef = z.object({ id: Id, nameKey: I18nKey, descKey: I18nKey });
export type TraitBranchDef = z.infer<typeof TraitBranchDef>;

export const TraitNodeDef = z.object({
  id: Id,
  /** A branch id, or "hybrid" for nodes unlocked by two branches. */
  branch: Id,
  /** minor = numbers; card = changes a skill card; keystone = big trade-off (limited); hybrid = two-branch node. */
  kind: z.enum(['minor', 'card', 'keystone', 'hybrid']),
  nameKey: I18nKey,
  descKey: I18nKey,
  maxRank: z.number().int().positive(),
  /** Trait points per rank. */
  cost: z.number().int().positive(),
  /** Points already spent in this node's branch (other nodes) before the first rank. */
  requiresBranchPoints: z.number().int().nonnegative().default(0),
  /** Hybrid nodes: points needed in each listed branch. */
  requiresBranches: z.record(Id, z.number().int().positive()).default({}),
  /** Node ids that need at least one rank first. */
  requiresNodes: z.array(Id).default([]),
  /** Run mods per rank (stat-mods convention). */
  mods: z.record(z.string(), z.number()).default({}),
  /** Card param deltas per rank: `{ cardId: { param: delta } }`. */
  cardParams: z.record(Id, z.record(z.string(), z.number())).default({}),
  /** Card draft weight multipliers (not per rank). */
  cardWeights: z.record(Id, z.number().nonnegative()).default({}),
  /** Keystone "lone wolf": no AI heroes are brought into runs. */
  noAllies: z.boolean().default(false),
});
export type TraitNodeDef = z.infer<typeof TraitNodeDef>;

export const TraitsDef = z.object({
  branches: z.array(TraitBranchDef).min(1),
  nodes: z.array(TraitNodeDef).min(1),
  limits: z.object({ keystones: z.number().int().positive() }),
  /** GDD §5: free reset until the first class; after that a full or one-branch reset costs items. */
  respec: z.object({
    freeUntilLevel: z.number().int().nonnegative(),
    itemId: Id,
    fullCost: z.number().int().nonnegative(),
    branchCost: z.number().int().nonnegative(),
  }),
});
export type TraitsDef = z.infer<typeof TraitsDef>;

/* ------------------------------------------------------------------------------------------ */

export const ContentBundle = z.object({
  version: z.string(),
  balance: BalanceDef,
  meta: MetaDef,
  traits: TraitsDef,
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
