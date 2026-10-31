/**
 * HUD store: an immutable snapshot of what React needs, published by the session at most
 * `HUD_HZ` times per second (designer AC-H6: ≤ 10 re-renders/s) and immediately on discrete
 * changes (phase, draft, pause, run end). React reads it with `useHud(selector)`.
 */
import { useSyncExternalStore } from 'react';
import type { CardOption, ScoreBreakdown, WaveIntel } from '@them/core';

export const HUD_HZ = 10;

export interface HudState {
  ready: boolean;
  phase: 'prep' | 'wave' | 'ended';
  paused: boolean;
  result: 'win' | 'lose' | null;
  wave: number;
  waveCount: number;
  prepTimeLeft: number;
  elapsed: number;
  heroHp: number;
  heroMaxHp: number;
  coreHp: number;
  coreMaxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  wood: number;
  stone: number;
  score: number;
  draft: readonly CardOption[] | null;
  rerollsLeft: number;
  slotsUsed: number;
  maxSlots: number;
  intel: WaveIntel | null;
  boss: { bossId: string; nameKey: string; hpFrac: number; phase: number; phases: number; enraged: boolean } | null;
  coreThreat: boolean;
  selectedBuilding: string | null;
  final: ScoreBreakdown | null;
}

export const initialHud: HudState = {
  ready: false, phase: 'prep', paused: false, result: null, wave: 1, waveCount: 20, prepTimeLeft: 0, elapsed: 0,
  heroHp: 0, heroMaxHp: 1, coreHp: 0, coreMaxHp: 1, level: 1, xp: 0, xpToNext: 1, wood: 0, stone: 0, score: 0,
  draft: null, rerollsLeft: 0, slotsUsed: 0, maxSlots: 0, intel: null, boss: null, coreThreat: false,
  selectedBuilding: null, final: null,
};

export class HudStore {
  private state: HudState = initialHud;
  private readonly subs = new Set<() => void>();

  get = (): HudState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  };

  set(patch: Partial<HudState>): void {
    let changed = false;
    for (const k in patch) {
      const key = k as keyof HudState;
      if (!Object.is(patch[key], this.state[key])) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.subs) fn();
  }
}

/** Subscribe a component to a slice of the HUD state. Return primitives or stable references. */
export function useHud<T>(store: HudStore, select: (s: HudState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(initialHud));
}
