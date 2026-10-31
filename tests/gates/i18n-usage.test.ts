/**
 * QA gate: every i18n key referenced by content and by apps/game source exists in both locales.
 *
 * - Content: every `*Key` field of the loaded bundle (after zod defaults).
 * - Source: static `t('…')`, `i18n.t('…')`, `i18nKey="…"` in apps/game/src. Template keys such as
 *   t(`side.${s}`) are matched as patterns: at least one key must match, and every matching key must
 *   exist in both locales. Dynamic `t(variable)` calls are not checkable here; the content check
 *   covers the ones that read `*Key` fields.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';
import { flattenKeys } from '../../packages/i18n/src/flatten';
import en from '../../packages/i18n/src/locales/en.json' with { type: 'json' };
import th from '../../packages/i18n/src/locales/th.json' with { type: 'json' };
import { files, lineOf, read, rel, stripComments } from './source-scan';

const TH = new Set(flattenKeys(th));
const EN = new Set(flattenKeys(en));
const missing = (k: string) => `${TH.has(k) ? '' : '[th]'}${EN.has(k) ? '' : '[en]'}`;

function contentKeys(node: unknown, path: string, out: { key: string; where: string }[]): void {
  if (Array.isArray(node)) node.forEach((v, i) => contentKeys(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/Key$/.test(k) && typeof v === 'string') out.push({ key: v, where: `${path}.${k}` });
      else contentKeys(v, `${path}.${k}`, out);
    }
  }
}

const CALL_RE = /(?:^|[^\w$.])(?:i18n\.)?t\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const ATTR_RE = /i18nKey=\{?\s*(['"`])([^'"`]+)\1/g;

function sourceRefs(): { key: string; where: string; template: boolean }[] {
  const out: { key: string; where: string; template: boolean }[] = [];
  for (const f of files('apps/game/src', ['.ts', '.tsx'])) {
    if (/\.test\.tsx?$/.test(f)) continue;
    const src = stripComments(read(f));
    for (const re of [CALL_RE, ATTR_RE]) {
      re.lastIndex = 0;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        out.push({ key: m[2]!, where: `${rel(f)}:${lineOf(src, m.index)}`, template: m[1] === '`' && m[2]!.includes('${') });
      }
    }
  }
  return out;
}

describe('i18n key usage (QA gate)', () => {
  it('every content *Key exists in th and en', () => {
    const refs: { key: string; where: string }[] = [];
    contentKeys(content, 'content', refs);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => missing(r.key)).map((r) => `${r.where}: ${r.key} ${missing(r.key)}`)).toEqual([]);
  });

  it('every t(…) key in apps/game/src exists in th and en', () => {
    const refs = sourceRefs();
    expect(refs.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const r of refs) {
      if (r.template) {
        const re = new RegExp(`^${r.key.split(/\$\{[^}]*\}/).map((s) => s.replace(/[.*+?^()|[\]\\]/g, '\\$&')).join('[^.]+')}$`);
        const hits = [...new Set([...TH, ...EN])].filter((k) => re.test(k));
        if (hits.length === 0) bad.push(`${r.where}: \`${r.key}\` matches no key`);
        for (const k of hits) if (missing(k)) bad.push(`${r.where}: ${k} ${missing(k)}`);
      } else if (missing(r.key)) bad.push(`${r.where}: ${r.key} ${missing(r.key)}`);
    }
    expect(bad).toEqual([]);
  });

  it('no user-facing string literal in JSX text of apps/game/src (letters between tags)', () => {
    // Heuristic for CLAUDE.md rule 1: `>Some words<` in .tsx. Symbols/numbers are fine.
    const bad: string[] = [];
    for (const f of files('apps/game/src', ['.tsx'])) {
      const src = stripComments(read(f));
      const re = />\s*([A-Za-z฀-๿][^<>{}]*?)\s*</g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        if (/[A-Za-z฀-๿]{2,}/.test(m[1]!)) bad.push(`${rel(f)}:${lineOf(src, m.index)}: "${m[1]}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});
