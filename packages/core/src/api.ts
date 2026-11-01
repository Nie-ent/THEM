/**
 * @them/core public API. The renderer, the balance bot, tests and (phase 4) the server sim worker
 * use only what is exported here. Laborers: do not change these signatures — ask the Engineer.
 *
 *   const run = createRun({ worldId: 'garroth' }, content, seed);
 *   every 1/30 s:  step(run, input);  for (const ev of drainEvents(run)) …
 *   render:        view(run) → read-only typed arrays + run state; interpolate with `alpha`.
 */
import type { ContentBundle } from '@them/content';
import { DT, Kind, TICK_RATE } from './constants';
import './effects';
import { cellAt, cellCenter, createRunImpl, currentScore, stepRunImpl, waveIntel } from './sim';
import type {
  BuildGrid, CardOption, InputFrame, Run, RunConfig, RunPhase, ScoreBreakdown, SimEvent, Telegraph, WaveIntel,
} from './types';
import { NO_INPUT } from './types';

export { DT, TICK_RATE, Kind, NO_INPUT };
export { cellAt, cellCenter };

/** Create a run. Throws on unknown world/ids or content referencing unregistered effects. */
export function createRun(config: RunConfig, content: ContentBundle, seed: number): Run {
  return createRunImpl(config, content, seed);
}

/** Advance exactly one fixed step (1/30 s). `input` is applied at the start of the step. */
export function step(run: Run, input: InputFrame = NO_INPUT): void {
  stepRunImpl(run, input);
}

/** Returns and clears the events produced since the last drain, in emission order. */
export function drainEvents(run: Run): SimEvent[] {
  const ev = run.events;
  run.events = [];
  return ev;
}

/** Quantize an analog stick / keyboard vector (-1..1) into the integer InputFrame move fields. */
export function quantizeMove(x: number, y: number): { moveX: number; moveY: number } {
  const len = Math.sqrt(x * x + y * y);
  const s = len > 1 ? 1 / len : 1;
  return { moveX: Math.round(x * s * 127), moveY: Math.round(y * s * 127) };
}

/* ------------------------------------------------------------------------------------------ */
/* Read-only views                                                                            */
/* ------------------------------------------------------------------------------------------ */

export interface EntityView {
  /** Loop `for (let i = 0; i < count; i++) if (kind[i] !== Kind.None) …` */
  readonly count: number;
  readonly kind: Readonly<Uint8Array>;
  readonly uid: Readonly<Uint32Array>;
  /** Content index (enemies/buildings/heroes), PickupType for pickups, shooter Kind for projectiles. */
  readonly def: Readonly<Int16Array>;
  readonly team: Readonly<Uint8Array>;
  readonly flags: Readonly<Uint16Array>;
  readonly x: Readonly<Float64Array>;
  readonly y: Readonly<Float64Array>;
  /** Previous-step position: render at prev + (cur - prev) * alpha. */
  readonly prevX: Readonly<Float64Array>;
  readonly prevY: Readonly<Float64Array>;
  readonly faceX: Readonly<Float64Array>;
  readonly faceY: Readonly<Float64Array>;
  readonly radius: Readonly<Float64Array>;
  readonly hp: Readonly<Float64Array>;
  readonly maxHp: Readonly<Float64Array>;
  readonly burn: Readonly<Float64Array>;
  /** Seconds a ranged enemy has been aiming (draw aim line while > 0). */
  readonly aim: Readonly<Float64Array>;
  readonly target: Readonly<Int32Array>;
}

export interface RunView {
  readonly tick: number;
  readonly phase: RunPhase;
  readonly result: 'win' | 'lose' | null;
  readonly paused: boolean;
  /** 1-based wave number (during prep: the wave about to start). */
  readonly wave: number;
  readonly waveCount: number;
  readonly prepTimeLeft: number;
  /** Seconds of active play (excludes pause and card draft). */
  readonly elapsed: number;
  readonly arena: { readonly width: number; readonly height: number };
  readonly hero: number;
  readonly core: number;
  readonly allies: readonly number[];
  readonly entities: EntityView;
  readonly wood: number;
  readonly stone: number;
  readonly level: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly draft: readonly CardOption[] | null;
  readonly rerollsLeft: number;
  readonly cards: readonly { readonly id: string; readonly level: number }[];
  readonly grid: Readonly<BuildGrid>;
  readonly telegraphs: readonly Readonly<Telegraph>[];
  readonly bosses: readonly { readonly e: number; readonly bossId: string; readonly phase: number; readonly enraged: boolean; readonly stance: string }[];
  /**
   * Difficulty limiter (GDD §3, src/power.ts). `power`: from the loadout (bare = 100);
   * `effectivePower`: after the limiter; `limiterActive`: power is above `recommendedPower` and the
   * loadout is scaled by `loadoutScale`.
   */
  readonly power: number;
  readonly recommendedPower: number;
  readonly effectivePower: number;
  readonly limiterActive: boolean;
  readonly loadoutScale: number;
}

/** Snapshot of run state for the renderer/HUD. Cheap: typed arrays are shared, not copied. */
export function view(run: Run): RunView {
  const w = run.w;
  const t = run.balance.xpTable;
  return {
    tick: run.tick,
    phase: run.phase,
    result: run.result,
    paused: run.paused,
    wave: run.waveIndex + 1,
    waveCount: run.worldDef.waves.length,
    prepTimeLeft: Math.max(0, run.prepTimer),
    elapsed: run.activeTicks * DT,
    arena: run.worldDef.arena,
    hero: run.hero,
    core: run.core,
    allies: run.allies,
    entities: {
      count: w.highWater, kind: w.kind, uid: w.uid, def: w.def, team: w.team, flags: w.flags,
      x: w.x, y: w.y, prevX: w.px, prevY: w.py, faceX: w.fx, faceY: w.fy, radius: w.radius,
      hp: w.hp, maxHp: w.maxHp, burn: w.burnT, aim: w.aimT, target: w.target,
    },
    wood: run.wood,
    stone: run.stone,
    level: run.level,
    xp: run.xp,
    xpToNext: t[Math.min(run.level, t.length) - 1]!,
    draft: run.draft,
    rerollsLeft: run.rerollsLeft,
    cards: run.cards,
    grid: run.grid,
    telegraphs: run.telegraphs,
    bosses: run.bosses.map((b) => ({ e: b.e, bossId: run.idx.bosses[b.def]!.id, phase: b.phase, enraged: b.enraged, stance: b.stance })),
    power: run.limiter.power,
    recommendedPower: run.limiter.recommended,
    effectivePower: run.limiter.effectivePower,
    limiterActive: run.limiter.active,
    loadoutScale: run.limiter.scale,
  };
}

/** Intel for the wave about to start (prep) or the next one (during a wave). Null after the last. */
export function intel(run: Run, wave?: number): WaveIntel | null {
  const idx = wave !== undefined ? wave - 1 : run.phase === 'prep' ? run.waveIndex : run.waveIndex + 1;
  return waveIntel(run, idx);
}

/** Live score using the GDD §12 formula (final once phase === 'ended'). */
export function score(run: Run): ScoreBreakdown {
  return currentScore(run);
}

/**
 * FNV-1a hash over every piece of simulation state (entities, RNG streams, run counters, cards,
 * bosses, telegraphs, build grid). Two runs with equal hashes are in the same state.
 */
export function stateHash(run: Run): string {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  const mixU = (v: number) => { h = Math.imul(h ^ (v >>> 0), 0x01000193) >>> 0; };
  const mixF = (v: number) => { f64[0] = v; mixU(u32[0]!); mixU(u32[1]!); };
  const mixS = (s: string) => { for (let i = 0; i < s.length; i++) mixU(s.charCodeAt(i)); mixU(0xff); };
  const w = run.w;
  mixU(run.tick); mixU(run.activeTicks); mixS(run.phase); mixU(run.waveIndex); mixF(run.prepTimer); mixF(run.waveTime);
  mixF(run.limiter.scale); mixF(run.limiter.allyFactor); mixF(run.powerMult);
  mixU(run.spawnCursor); mixU(run.waveAlive); mixF(run.wood); mixF(run.stone); mixU(run.level); mixF(run.xp);
  mixU(run.pendingLevels); mixU(run.rerollsLeft); mixU(run.paused ? 1 : 0); mixF(run.heroDamageThisWave);
  mixF(run.heroDamageFracSum); mixU(run.kills.normal); mixU(run.kills.elite); mixU(run.kills.miniboss); mixU(run.kills.boss);
  for (const r of [run.rng, run.spawnRng, run.cardRng]) for (const s of r.state()) mixU(s);
  for (const c of run.cards) { mixS(c.id); mixU(c.level); }
  for (const k of Object.keys(run.cardState).sort()) { mixS(k); mixF(run.cardState[k]!); }
  if (run.draft) for (const o of run.draft) mixS(o.cardId);
  for (const b of run.bosses) {
    mixU(b.e); mixU(b.phase); mixF(b.t); mixU(b.enraged ? 1 : 0); mixS(b.stance);
    for (const k of Object.keys(b.state).sort()) { mixS(k); mixF(b.state[k]!); }
  }
  for (const t of run.telegraphs) { mixU(t.id); mixF(t.t); mixF(t.x); mixF(t.y); mixF(t.r); }
  for (let c = 0; c < run.grid.cell.length; c++) mixU(run.grid.cell[c]! + 1);
  mixU(w.highWater); mixU(w.nextUid);
  for (const f of w.freeList()) mixU(f);
  for (let i = 0; i < w.highWater; i++) {
    mixU(w.kind[i]!);
    if (w.kind[i] === Kind.None) continue;
    mixU(w.uid[i]!); mixU(w.def[i]! + 1); mixU(w.flags[i]!);
    mixF(w.x[i]!); mixF(w.y[i]!); mixF(w.vx[i]!); mixF(w.vy[i]!); mixF(w.hp[i]!); mixF(w.maxHp[i]!);
    mixF(w.atkT[i]!); mixF(w.aimT[i]!); mixF(w.life[i]!); mixF(w.value[i]!); mixF(w.burnT[i]!);
    mixF(w.aux0[i]!); mixF(w.aux1[i]!); mixF(w.wDamage[i]!); mixF(w.speed[i]!); mixU(w.target[i]! + 1);
  }
  return h.toString(16).padStart(8, '0');
}

export type {
  BuildCommand, BuildGrid, CardOption, Difficulty, InputFrame, Loadout, Mods, Run, RunConfig, RunPhase, ScoreBreakdown,
  SimEvent, SimEventType, Telegraph, TelegraphShape, TelegraphSpec, WaveIntel, BossRuntime,
} from './types';
