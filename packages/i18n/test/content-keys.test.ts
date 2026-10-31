/**
 * Every i18n key referenced by content JSON must exist in both locales.
 * Scans packages/content/data/**.json for fields named `*Key`, `name` or `desc` whose value looks
 * like a dotted key, and checks th.json + en.json.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import th from '../src/locales/th.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import { flattenKeys } from '../src/flatten';

const DATA_DIR = fileURLToPath(new URL('../../content/data', import.meta.url));
const KEY_RE = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsonFiles(p) : f.endsWith('.json') ? [p] : [];
  });
}

function collect(node: unknown, path: string, out: { key: string; where: string }[]): void {
  if (Array.isArray(node)) node.forEach((v, i) => collect(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const isKeyField = k.endsWith('Key') || k === 'name' || k === 'desc';
      if (isKeyField && typeof v === 'string') {
        if (!KEY_RE.test(v)) out.push({ key: `<prose: "${v}">`, where: `${path}.${k}` });
        else out.push({ key: v, where: `${path}.${k}` });
      } else collect(v, `${path}.${k}`, out);
    }
  }
}

describe('content i18n keys', () => {
  const thKeys = new Set(flattenKeys(th));
  const enKeys = new Set(flattenKeys(en));
  const refs: { key: string; where: string }[] = [];
  for (const f of jsonFiles(DATA_DIR)) collect(JSON.parse(readFileSync(f, 'utf8')), f.slice(DATA_DIR.length + 1), refs);

  it('finds content keys to check', () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it('every content key exists in th.json and en.json (no prose in content)', () => {
    const missing = refs
      .filter((r) => !thKeys.has(r.key) || !enKeys.has(r.key))
      .map((r) => `${r.where}: ${r.key}${thKeys.has(r.key) ? '' : ' [th]'}${enKeys.has(r.key) ? '' : ' [en]'}`);
    expect(missing).toEqual([]);
  });
});
