/**
 * GameSession owns one run: a fixed-step accumulator (30 Hz) driven by the render loop, the input
 * state, the event bridge and the HUD store. The Phaser scene calls `advance(dtMs)` every frame and
 * renders with `alpha` for interpolation; React talks to it only through `bridge`, `hud` and
 * `command()`.
 */
import { content } from '@them/content';
import {
  DT, cellCenter, createRun, drainEvents, intel, quantizeMove, score, step, view, type InputFrame, type Run,
} from '@them/core';
import { EventBridge } from './bridge';
import { InputState, type Command } from './input';
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

  constructor(seed: number) {
    this.seed = seed;
    this.run = createRun({ worldId: content.worlds[0]!.id }, content, seed);
    this.flushEvents();
    this.publishHud(true);
  }

  restart(seed = this.seed + 1): void {
    this.seed = seed;
    this.run = createRun({ worldId: content.worlds[0]!.id }, content, seed);
    this.input.clear();
    this.acc = 0;
    this.flushEvents();
    this.hud.set({ final: null, selectedBuilding: null, bossLine: null });
    this.publishHud(true);
  }

  command(cmd: Command): void {
    this.input.push(cmd);
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
      if (ev.type === 'runEnd') this.hud.set({ final: ev.score });
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
    this.hud.set({
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
    });
  }

  /** World position of a build cell's centre (for the scene's ghost/placement). */
  cellCenter(cell: number): { x: number; y: number } {
    return cellCenter(this.run.grid, cell);
  }
}
