/**
 * GameSession owns one run: a fixed-step accumulator (30 Hz) driven by the render loop, the input
 * state, the event bridge and the HUD store. The Phaser scene calls `advance(dtMs)` every frame and
 * renders with `alpha` for interpolation; React talks to it only through `bridge`, `hud` and
 * `command()`.
 */
import { content } from '@them/content';
import {
  DT, Kind, cellAt, cellCenter, createRun, drainEvents, intel, quantizeMove, score, step, view, type InputFrame, type Run,
} from '@them/core';
import { EventBridge } from './bridge';
import { InputState, type Command } from './input';
import { profileStore } from './profile';
import { HUD_HZ, HudStore } from './store';

const MAX_STEPS_PER_FRAME = 5;

export class GameSession {
  run: Run;
  readonly bridge = new EventBridge();
  readonly hud = new HudStore();
  readonly input = new InputState();
  /** 0..1 progress into the next step, for interpolation. */
  alpha = 0;
  private acc = 0;
  private hudAcc = 0;
  private coreThreatT = 0;
  seed: number;
  /** Id of the current run (seed + start time). */
  runId = '';
  /** Set by the stage scene: screen pixels → world position. */
  screenToWorld: ((x: number, y: number) => { x: number; y: number }) | null = null;
  /** Set by a React screen that wants stage taps (mobile build slot, hero placement). */
  tapListener: ((t: { cell: number; x: number; y: number }) => void) | null = null;
  /** Placement ghost the scene draws on the build grid during prep. */
  ghost: { cell: number; ok: boolean } | null = null;

  constructor(seed: number) {
    this.seed = seed;
    this.run = this.newRun(seed);
    this.flushEvents();
    this.publishHud(true);
  }

  restart(seed = this.seed + 1): void {
    this.seed = seed;
    this.run = this.newRun(seed);
    this.input.clear();
    this.acc = 0;
    this.flushEvents();
    this.hud.set({ final: null, selectedBuilding: null, bossLine: null });
    this.publishHud(true);
  }

  /** Each run gets an id so its rewards are paid exactly once. Config comes from the profile (P2-01). */
  private newRun(seed: number): Run {
    this.runId = `${seed}-${Date.now()}`;
    return createRun(profileStore.runConfig(content.worlds[0]!.id), content, seed);
  }

  command(cmd: Command): void {
    this.input.push(cmd);
  }

  /** Route a stage tap to the listening screen. Returns true when it was consumed. */
  tapAt(sx: number, sy: number): boolean {
    if (!this.tapListener || !this.screenToWorld) return false;
    const w = this.screenToWorld(sx, sy);
    this.tapListener({ cell: cellAt(this.run.grid, w.x, w.y), x: w.x, y: w.y });
    return true;
  }

  selectBuilding(id: string | null): void {
    this.hud.set({ selectedBuilding: id });
  }

  /** Called by the render loop with elapsed wall time. Runs 0..N fixed steps. */
  advance(dtMs: number): void {
    this.acc += Math.min(dtMs / 1000, DT * MAX_STEPS_PER_FRAME);
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      const m = this.input.move();
      const frame: InputFrame = { ...quantizeMove(m.x, m.y), ...this.input.take() };
      step(this.run, frame);
      this.flushEvents();
      this.acc -= DT;
      steps++;
    }
    // A frozen sim (pause, draft) must not interpolate.
    const frozen = this.run.paused || this.run.draft !== null || this.run.phase === 'ended';
    this.alpha = frozen ? 1 : this.acc / DT;
    this.coreThreatT = Math.max(0, this.coreThreatT - dtMs / 1000);
    this.hudAcc += dtMs;
    if (this.hudAcc >= 1000 / HUD_HZ) {
      this.hudAcc = 0;
      this.publishHud(false);
    }
  }

  private flushEvents(): void {
    let discrete = false;
    for (const ev of drainEvents(this.run)) {
      this.bridge.emit(ev);
      switch (ev.type) {
        case 'cardOffer': case 'cardPicked': case 'waveStart': case 'waveEnd': case 'paused': case 'runEnd':
        case 'buildingPlaced': case 'buildingSold': case 'bossPhase': case 'enrage':
          discrete = true;
          break;
        case 'telegraph':
          if (ev.targetsCore && ev.state === 'start') { this.coreThreatT = 1.5; discrete = true; }
          break;
        default:
          break;
      }
      if (ev.type === 'runEnd') {
        profileStore.recordRun(this.run, this.runId);
        this.hud.set({ final: ev.score });
      }
      if (ev.type === 'bossLine') {
        this.hud.set({ bossLine: { key: ev.key, bossId: ev.bossId, moment: ev.moment, seq: (this.hud.get().bossLine?.seq ?? 0) + 1 } });
      }
    }
    if (discrete) this.publishHud(true);
  }

  private publishHud(_force: boolean): void {
    const v = view(this.run);
    const e = v.entities;
    const b = v.bosses[0];
    const bd = b ? content.bosses.find((x) => x.id === b.bossId) : undefined;
    let burning = 0, upkeepWood = 0, upkeepStone = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === Kind.Structure && e.burn[i]! > 0) burning++;
    const grid = v.grid;
    for (let c = 0; c < grid.cellDef.length; c++) {
      const d = grid.cellDef[c]!;
      if (d < 0) continue;
      const up = content.buildings[d]?.upkeep;
      upkeepWood += up?.wood ?? 0;
      upkeepStone += up?.stone ?? 0;
    }
    this.hud.set({
      burning, upkeepWood, upkeepStone,
      ready: true,
      phase: v.phase,
      paused: v.paused,
      result: v.result,
      wave: v.wave,
      waveCount: v.waveCount,
      prepTimeLeft: Math.ceil(v.prepTimeLeft),
      elapsed: Math.floor(v.elapsed),
      heroHp: Math.ceil(e.hp[v.hero]!),
      heroMaxHp: Math.round(e.maxHp[v.hero]!),
      coreHp: Math.ceil(Math.max(0, e.hp[v.core]!)),
      coreMaxHp: Math.round(e.maxHp[v.core]!),
      level: v.level,
      xp: Math.floor(v.xp),
      xpToNext: v.xpToNext,
      wood: Math.floor(v.wood),
      stone: Math.floor(v.stone),
      score: score(this.run).total,
      draft: v.draft,
      rerollsLeft: v.rerollsLeft,
      slotsUsed: v.grid.slotsUsed,
      maxSlots: v.grid.maxSlots,
      intel: intel(this.run),
      boss: b && bd ? {
        bossId: b.bossId, nameKey: bd.nameKey, hpFrac: Math.max(0, e.hp[b.e]! / e.maxHp[b.e]!),
        phase: b.phase, phases: bd.phases.length, enraged: b.enraged,
      } : null,
      coreThreat: this.coreThreatT > 0,
      power: Math.round(v.power),
      recommendedPower: Math.round(v.recommendedPower),
      effectivePower: Math.round(v.effectivePower),
      limiterActive: v.limiterActive,
    });
  }

  /** World position of a build cell's centre (for the scene's ghost/placement). */
  cellCenter(cell: number): { x: number; y: number } {
    return cellCenter(this.run.grid, cell);
  }
}
