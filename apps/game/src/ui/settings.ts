import { useSyncExternalStore } from 'react';
import { readJson, writeStore } from './storage';

export interface Settings {
  damageNumbers: 'all' | 'important' | 'off';
  screenShake: boolean;
  reduceMotion: 'system' | 'on' | 'off';
  outline: 'normal' | 'thick';
  joystickSide: 'floating' | 'left' | 'right';
  joystickSize: 'S' | 'M' | 'L';
  master: number;
  sfx: number;
}

export const DEFAULT_SETTINGS: Settings = {
  damageNumbers: 'important',
  screenShake: true,
  reduceMotion: 'system',
  outline: 'normal',
  joystickSide: 'floating',
  joystickSize: 'M',
  master: 80,
  sfx: 80,
};

/** Joystick base diameters from the pause/settings spec. */
export const JOYSTICK_SIZES = { S: 112, M: 128, L: 152 } as const;

const KEY = 'them.settings';
let state: Settings = readJson(KEY, DEFAULT_SETTINGS);
const subs = new Set<() => void>();

export const getSettings = (): Settings => state;

export function updateSettings(patch: Partial<Settings>): void {
  state = { ...state, ...patch };
  writeStore(KEY, JSON.stringify(state));
  applyDocumentSettings();
  for (const fn of subs) fn();
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export const useSettings = (): Settings => useSyncExternalStore(subscribe, getSettings, getSettings);

/** `data-motion="reduce"` on <html> switches every ceremony animation to a short fade (see styles.css). */
export function applyDocumentSettings(): void {
  const system = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduce = state.reduceMotion === 'on' || (state.reduceMotion === 'system' && system);
  document.documentElement.dataset.motion = reduce ? 'reduce' : 'full';
}

export function initDocumentSettings(): void {
  applyDocumentSettings();
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyDocumentSettings);
}
