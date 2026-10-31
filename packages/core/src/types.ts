import type {
  AllyHeroDef, BalanceDef, BossDef, BuildingDef, CardDef, ContentBundle, EnemyDef, Grade, Side, WorldDef,
} from '@them/content';
import type { Params } from '@them/content';
import type { Kind, PickupType } from './constants';
import type { BossScript, BuildingBehavior, CardEffect, EnemyBehavior, Personality } from './registry';
import type { Rng } from './rng';
import type { SpatialHash } from './spatial';
import type { World } from './world';

/* ------------------------------------------------------------------------------------------ */
/* Config + inputs                                                                            */
/* ------------------------------------------------------------------------------------------ */

export type Difficulty = 'normal' | 'hard' | 'nightmare';

export interface RunConfig {
  worldId: string;
  difficulty?: Difficulty;
  /** Number of hardcore modifiers active (+0.1 difficulty multiplier each, GDD §12). */
  hardcoreRules?: number;
  /** Player power. Defaults to the world's recommended power. Fed through the difficulty limiter. */
  power?: number;
  /** AI hero ids brought into the run (content `heroes[].id`). */
  allyHeroes?: string[];
}

/** One build command. `cell` = row * cols + col of the build grid. */
export interface BuildCommand {
  buildingId: string;
  cell: number;
}

/**
 * Player input for one tick. Everything except `moveX/moveY` is a one-shot command.
 * Move components are quantized integers in [-127, 127] so replays are exact.
 */
export interface InputFrame {
  moveX: number;
  moveY: number;
  /** Index into the open card offer (0..cardChoices-1). */
  pickCard?: number;
  reroll?: boolean;
  build?: BuildCommand;
  /** Sell the structure on this build cell. */
  sell?: number;
  /** Move an AI hero's post during prep (world coordinates). */
  placeHero?: { heroId: string; x: number; y: number };
  callWave?: boolean;
  /** Toggles pause. */
  pause?: boolean;
}

export const NO_INPUT: Readonly<InputFrame> = Object.freeze({ moveX: 0, moveY: 0 });

/* ------------------------------------------------------------------------------------------ */
/* Events                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type SimEvent =
  | { type: 'spawn'; e: number; uid: number; kind: Kind; def: number }
  | { type: 'hit'; e: number; uid: number; kind: Kind; amount: number; crit: boolean; source: number; x: number; y: number }
  | { type: 'death'; e: number; uid: number; kind: Kind; def: number; x: number; y: number }
  | { type: 'levelUp'; level: number }
  | { type: 'cardOffer'; options: CardOption[]; rerollsLeft: number }
  | { type: 'cardPicked'; cardId: string; level: number }
  | { type: 'buildingPlaced'; cell: number; buildingId: string; e: number }
  | { type: 'buildingSold'; cell: number; buildingId: string; refundWood: number; refundStone: number }
  /** Structures and enemies. `ignite` on a new fire (not on refresh), `end` when it goes out. */
  | { type: 'burn'; e: number; uid: number; kind: Kind; state: 'ignite' | 'resist' | 'end' }
  | { type: 'telegraph'; id: number; state: 'start' | 'impact'; targetsCore: boolean }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveEnd'; wave: number }
  | { type: 'upkeep'; paidWood: number; paidStone: number; decayed: number }
  | { type: 'pickup'; pickup: PickupType; amount: number }
  | { type: 'bossPhase'; e: number; bossId: string; phase: number }
  | { type: 'enrage'; e: number; bossId: string }
  /** A boss line for the UI (i18n key from bosses.json: params.introKey/defeatKey, phase params.lineKey). */
  | { type: 'bossLine'; e: number; bossId: string; moment: 'intro' | 'phase' | 'defeat'; phase: number; key: string }
  | { type: 'paused'; paused: boolean }
  | { type: 'rejected'; command: 'build' | 'sell' | 'pickCard' | 'reroll' | 'placeHero' | 'callWave'; reason: string }
  | { type: 'runEnd'; result: 'win' | 'lose'; score: ScoreBreakdown };

export type SimEventType = SimEvent['type'];

export interface CardOption {
  cardId: string;
  /** Level the card will have after picking (1 = new). */
  nextLevel: number;
}

/* ------------------------------------------------------------------------------------------ */
/* Scoring                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface ScoreBreakdown {
  kills: { normal: number; elite: number; miniboss: number; boss: number };
  killPoints: number;
  bossBonus: number;
  mDifficulty: number;
  mSpeed: number;
  mDamage: number;
  /** M_speed × M_damage — what the grade is judged on. */
  performance: number;
  total: number;
  grade: Grade;
  rewardPct: number;
}

/* ------------------------------------------------------------------------------------------ */
/* Modifiers (cards write these)                                                              */
/* ------------------------------------------------------------------------------------------ */

/** Multipliers start at 1, additive fields at 0. Recomputed from owned cards after every pick. */
export interface Mods {
  damageMult: number;
  cooldownMult: number;
  rangeMult: number;
  projectileSpeedMult: number;
  speedMult: number;
  maxHpMult: number;
  pickupRadiusMult: number;
  xpMult: number;
  armorAdd: number;
  projectileCountAdd: number;
  pierceAdd: number;
  regenPerSec: number;
  critChance: number;
  critMult: number;
  /** Towers and traps (GDD §4 "การบัญชาการ"). */
  structureDamageMult: number;
  allyDamageMult: number;
  /** Damage the hero takes. */
  damageTakenMult: number;
}

export function baseMods(): Mods {
  return {
    damageMult: 1, cooldownMult: 1, rangeMult: 1, projectileSpeedMult: 1, speedMult: 1, maxHpMult: 1,
    pickupRadiusMult: 1, xpMult: 1, armorAdd: 0, projectileCountAdd: 0, pierceAdd: 0, regenPerSec: 0,
    critChance: 0, critMult: 1.5, structureDamageMult: 1, allyDamageMult: 1, damageTakenMult: 1,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Telegraphs                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export type TelegraphShape = 'circle' | 'rect' | 'cone' | 'ring';

export interface TelegraphSpec {
  shape: TelegraphShape;
  /** Origin. circle/ring: centre. rect/cone: apex at the attacker. */
  x: number;
  y: number;
  /** circle/cone: radius. ring: outer radius. rect: length. */
  r: number;
  /** ring: inner (safe) radius. rect: half width. cone: cos of the half-angle. */
  r2?: number;
  /** rect/cone direction (unit vector). */
  dx?: number;
  dy?: number;
  /** Seconds from start to impact. Must be >= 0.7 (docs/design/readability.md §5). */
  windup: number;
  damage: number;
  /** Violet Core-threat styling + HUD flash. Set when the attack is aimed at the Core. */
  targetsCore?: boolean;
  /** Entity that owns it; when it dies the telegraph is cancelled. -1 for none. */
  owner?: number;
}

export interface Telegraph extends Required<TelegraphSpec> {
  id: number;
  /** Seconds elapsed since start. */
  t: number;
  active: boolean;
}

/* ------------------------------------------------------------------------------------------ */
/* Run                                                                                        */
/* ------------------------------------------------------------------------------------------ */

export type RunPhase = 'prep' | 'wave' | 'ended';

export interface Resolved {
  /** Per enemy def: its behaviours. */
  enemyBehaviors: { b: EnemyBehavior; params: Params }[][];
  buildingBehaviors: BuildingBehavior[];
  personalities: Personality[];
  bossScripts: BossScript[];
  cardEffects: CardEffect[];
}

export interface ContentIndex {
  enemies: EnemyDef[];
  buildings: BuildingDef[];
  heroes: AllyHeroDef[];
  cards: CardDef[];
  bosses: BossDef[];
  enemyIdx: Map<string, number>;
  buildingIdx: Map<string, number>;
  heroIdx: Map<string, number>;
  cardIdx: Map<string, number>;
  bossIdx: Map<string, number>;
}

export interface SpawnEntry {
  /** Seconds after wave start. */
  at: number;
  enemy: number;
  side: Side;
}

export interface BuildGrid {
  cols: number;
  rows: number;
  cellSize: number;
  /** World position of the top-left corner of cell 0. */
  originX: number;
  originY: number;
  buildable: Uint8Array;
  /** Structure entity on each cell, -1 if empty. */
  cell: Int32Array;
  /** Building def index on each cell, -1 if empty. */
  cellDef: Int16Array;
  maxSlots: number;
  slotsUsed: number;
}

export interface BossRuntime {
  /** Active stance name from bosses.json `stances`, or '' for none. Set via ctx.bossStance. */
  stance: string;
  e: number;
  uid: number;
  def: number;
  phase: number;
  /** Seconds since spawn. */
  t: number;
  enraged: boolean;
  /** Script-owned numeric state (hashed). */
  state: Record<string, number>;
}

export interface WaveIntel {
  /** 1-based wave number the intel describes. */
  wave: number;
  kind: 'normal' | 'miniboss' | 'boss';
  enemies: { enemyId: string; count: number }[];
  /** Share of the wave's enemies per side, 0..1. */
  sides: Record<Side, number>;
}

export interface Run {
  readonly config: Required<RunConfig>;
  readonly content: ContentBundle;
  readonly worldDef: WorldDef;
  readonly balance: BalanceDef;
  readonly idx: ContentIndex;
  readonly seed: number;

  readonly w: World;
  readonly hash: SpatialHash;
  /** Combat stream (crits, drops, behaviours). */
  readonly rng: Rng;
  /** Spawn positions. */
  readonly spawnRng: Rng;
  /** Card draft. */
  readonly cardRng: Rng;

  tick: number;
  /** Ticks during which the sim actually advanced (not paused, no draft). Drives M_speed. */
  activeTicks: number;
  phase: RunPhase;
  result: 'win' | 'lose' | null;
  paused: boolean;

  /** 0-based. During prep: the wave about to start. During a wave: the wave in progress. */
  waveIndex: number;
  prepTimer: number;
  waveTime: number;
  spawnQueue: SpawnEntry[];
  spawnCursor: number;
  /** Enemies of the current wave still alive. */
  waveAlive: number;

  hero: number;
  core: number;
  allies: number[];
  /** Ally hero def index per entry of `allies`. */
  allyDefs: number[];

  wood: number;
  stone: number;
  grid: BuildGrid;

  level: number;
  xp: number;
  pendingLevels: number;
  draft: CardOption[] | null;
  rerollsLeft: number;
  /** Owned cards in first-pick order. */
  cards: { id: string; level: number }[];
  mods: Mods;
  /** Free numeric state for card hooks, keyed `${cardId}.${name}` (hashed). */
  cardState: Record<string, number>;
  /** Hero / structure damage multiplier from the difficulty limiter. */
  powerMult: number;

  bosses: BossRuntime[];
  telegraphs: Telegraph[];
  nextTelegraphId: number;

  kills: { normal: number; elite: number; miniboss: number; boss: number };
  bossKilled: boolean;
  heroDamageThisWave: number;
  heroDamageFracSum: number;
  wavesScored: number;

  /** Registry objects resolved from content ids at createRun (not state; not hashed). */
  readonly res: Resolved;

  /** Test/bench only: hero and Core take no damage. Never set in real play. */
  debugInvulnerable: boolean;

  events: SimEvent[];
  /** Scratch buffers (no per-tick allocation). */
  readonly scratch: Int32Array;
  readonly scratch2: Int32Array;
  /** Player-side damageable entities (hero, allies, structures, core), rebuilt every tick. */
  readonly playerSide: Int32Array;
  playerSideCount: number;
}
