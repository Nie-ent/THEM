import type { Params } from '@them/content';

/**
 * Read a numeric param for a given card/building level. A number is used at every level; an array
 * is a per-level table (index level-1, last entry repeats). Missing → `fallback`.
 */
export function num(params: Params, key: string, level = 1, fallback = 0): number {
  const v = params[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && v.length > 0) return v[Math.min(level, v.length) - 1];
  return fallback;
}

export function str(params: Params, key: string, fallback = ''): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

export function bool(params: Params, key: string, fallback = false): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}
