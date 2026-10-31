/** Helpers for the static-scan gates: list source files, strip comments, line numbers. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function files(dir: string, exts: string[]): string[] {
  const abs = join(ROOT, dir);
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      if (f === 'node_modules' || f === 'dist') continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (exts.some((e) => f.endsWith(e))) out.push(p);
    }
  };
  walk(abs);
  return out.sort();
}

export const rel = (p: string) => relative(ROOT, p);
export const read = (p: string) => readFileSync(p, 'utf8');

/** Replace comments with spaces (keeps offsets/line numbers). Naive about comment markers in strings. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));
}

export function lineOf(src: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}
